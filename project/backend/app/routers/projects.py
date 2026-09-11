"""Проекты: доступ owner/editor/viewer + участники. Системная роль ≠ доступ ≠ AI-роли."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..deps import ROLE_RANK, accessible_project, get_current_user, project_role
from .meetings import meeting_detail, meeting_row

router = APIRouter(prefix="/api/projects")

MEETING_STATUS_RANK = {"error": 0, "uploaded": 1, "extracting": 1, "transcribing": 1, "analyzing": 1, "done": 2}


def _project_out(p: models.Project, role: str) -> schemas.ProjectOut:
    ms = p.meetings
    ranks = [MEETING_STATUS_RANK.get(m.status, 1) for m in ms]
    status = "empty" if not ms else ("ready" if all(r == 2 for r in ranks) else
                                     ("error" if any(r == 0 for r in ranks) else "work"))
    return schemas.ProjectOut(id=p.id, name=p.name, description=p.description,
                              created_at=p.created_at, updated_at=p.updated_at,
                              meetings_count=len(ms),
                              last_meeting_at=max((m.created_at for m in ms), default=None),
                              status=status, my_role=role,
                              owner_name=p.owner.name if p.owner else None)


def _visible_projects(user: models.User, db: Session) -> list[tuple[models.Project, str]]:
    """Свои + доступные (участник) + все (admin)."""
    if user.system_role == "admin":
        projects = db.query(models.Project).order_by(models.Project.updated_at.desc()).all()
        return [(p, "owner") for p in projects]
    owned = db.query(models.Project).filter(models.Project.user_id == user.id).all()
    shared = [pm.project for pm in db.query(models.ProjectMember).filter_by(user_id=user.id).all()
              if pm.project is not None]
    seen: set[str] = set()
    out = []
    for p in sorted(owned + shared, key=lambda x: x.updated_at, reverse=True):
        if p.id in seen:
            continue
        seen.add(p.id)
        out.append((p, project_role(user, p, db) or "viewer"))
    return out


@router.get("", response_model=list[schemas.ProjectOut])
def list_projects(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return [_project_out(p, role) for p, role in _visible_projects(user, db)]


@router.post("", response_model=schemas.ProjectOut, status_code=201)
def create_project(body: schemas.ProjectIn, user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    p = models.Project(user_id=user.id, name=body.name, description=body.description.strip())
    db.add(p)
    db.commit()
    db.refresh(p)
    return _project_out(p, "owner")


@router.get("/{pid}", response_model=schemas.ProjectOut)
def get_project(pid: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p, role = accessible_project(pid, user, db)
    return _project_out(p, role)


@router.patch("/{pid}", response_model=schemas.ProjectOut)
def patch_project(pid: str, body: schemas.ProjectPatch, user: models.User = Depends(get_current_user),
                  db: Session = Depends(get_db)):
    p, role = accessible_project(pid, user, db, min_role="owner")
    if body.name is not None and body.name.strip():
        p.name = body.name.strip()[:200]
    if body.description is not None:
        p.description = body.description.strip()
    db.commit()
    db.refresh(p)
    return _project_out(p, role)


@router.delete("/{pid}")
def delete_project(pid: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    accessible_project(pid, user, db, min_role="owner")
    p = db.get(models.Project, pid)
    paths = [m.file_path for m in p.meetings if m.file_path]
    db.delete(p)
    db.commit()
    for path in paths:
        if path and not db.query(models.Meeting).filter(models.Meeting.file_path == path).count():
            try:
                Path(path).unlink(missing_ok=True)
            except OSError:
                pass
    return {"ok": True}


# ---------- встречи проекта ----------
@router.get("/{pid}/meetings")
def project_meetings(pid: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p, _ = accessible_project(pid, user, db)
    return [meeting_row(m) for m in sorted(p.meetings, key=lambda x: x.created_at, reverse=True)]


@router.get("/{pid}/meetings/{meeting_id}", response_model=schemas.MeetingDetail)
def project_meeting(pid: str, meeting_id: str, user: models.User = Depends(get_current_user),
                    db: Session = Depends(get_db)):
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    p, role = accessible_project(pid, user, db)
    if m.project_id != p.id:
        raise HTTPException(404, "встреча не найдена в этом проекте")
    return meeting_detail(m, db, role)


# ---------- участники ----------
@router.get("/{pid}/members", response_model=list[schemas.MemberOut])
def list_members(pid: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p, _ = accessible_project(pid, user, db)
    owner = ({"name": p.owner.name, "email": p.owner.email, "user_id": p.owner.id}
             if p.owner and p.owner.is_active is not None else None)
    rows = []
    if owner:
        rows.append(schemas.MemberOut(id="owner", user_id=owner["user_id"], name=owner["name"],
                                      email=owner["email"], role="owner", created_at=p.created_at))
    for pm in p.members:
        if pm.user_id == (p.user_id if p else None):
            continue
        rows.append(schemas.MemberOut(id=pm.id, user_id=pm.user_id, name=pm.user.name,
                                      email=pm.user.email, role=pm.role, created_at=pm.created_at))
    return rows


@router.post("/{pid}/members", response_model=schemas.MemberOut, status_code=201)
def add_member(pid: str, body: schemas.MemberIn, user: models.User = Depends(get_current_user),
               db: Session = Depends(get_db)):
    p, _ = accessible_project(pid, user, db, min_role="owner")
    target = db.query(models.User).filter(models.User.email == body.email).first()
    if target is None:
        raise HTTPException(404, "Пользователь с таким email не найден")
    if target.id == p.user_id:
        raise HTTPException(409, "Это владелец проекта")
    if any(pm.user_id == target.id for pm in p.members):
        raise HTTPException(409, "Участник уже добавлен")
    pm = models.ProjectMember(project_id=p.id, user_id=target.id, role=body.role)
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return schemas.MemberOut(id=pm.id, user_id=target.id, name=target.name,
                             email=target.email, role=pm.role, created_at=pm.created_at)


@router.patch("/{pid}/members/{mid}", response_model=schemas.MemberOut)
def patch_member(pid: str, mid: str, body: schemas.MemberIn, user: models.User = Depends(get_current_user),
                 db: Session = Depends(get_db)):
    p, _ = accessible_project(pid, user, db, min_role="owner")
    pm = db.get(models.ProjectMember, mid)
    if pm is None or pm.project_id != p.id:
        raise HTTPException(404, "участник не найден")
    if body.role not in {"editor", "viewer"}:
        raise HTTPException(422, "owner назначается только владельцем проекта")
    pm.role = body.role
    db.commit()
    return schemas.MemberOut(id=pm.id, user_id=pm.user_id, name=pm.user.name,
                             email=pm.user.email, role=pm.role, created_at=pm.created_at)


@router.delete("/{pid}/members/{mid}")
def remove_member(pid: str, mid: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    p, _ = accessible_project(pid, user, db, min_role="owner")
    pm = db.get(models.ProjectMember, mid)
    if pm is None or pm.project_id != p.id:
        raise HTTPException(404, "участник не найден")
    db.delete(pm)
    db.commit()
    return {"ok": True}
