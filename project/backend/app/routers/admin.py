"""Админ-панель: /api/admin/* — доступ только для system_role=admin (проверка на backend)."""
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..db import get_db
from ..deps import require_admin

router = APIRouter(prefix="/api/admin")


class UserPatch(BaseModel):
    system_role: str | None = None
    is_active: bool | None = None

    @field_validator("system_role")
    @classmethod
    def _r(cls, v):
        if v is not None and v not in {"admin", "user"}:
            raise ValueError("system_role: admin|user")
        return v


@router.get("/users")
def list_users(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = []
    for u in db.query(models.User).order_by(models.User.created_at.desc()).all():
        pcount = db.query(func.count(models.Project.id)).filter(models.Project.user_id == u.id).scalar()
        mcount = db.query(func.count(models.Meeting.id)).filter(models.Meeting.user_id == u.id).scalar()
        rows.append({"id": u.id, "name": u.name, "email": u.email, "system_role": u.system_role,
                     "status": "active" if u.is_active else "blocked",
                     "created_at": schemas.iso_utc(u.created_at),
                     "projects_count": pcount, "meetings_count": mcount})
    return rows


@router.patch("/users/{uid}")
def patch_user(uid: str, body: UserPatch, admin: models.User = Depends(require_admin),
               db: Session = Depends(get_db)):
    if uid == admin.id and (body.system_role == "user" or body.is_active is False):
        raise HTTPException(400, "Нельзя понизить или заблокировать себя")
    u = db.get(models.User, uid)
    if u is None:
        raise HTTPException(404, "пользователь не найден")
    if body.system_role is not None:
        u.system_role = body.system_role
    if body.is_active is not None:
        u.is_active = body.is_active
    db.commit()
    return {"ok": True, "id": u.id, "system_role": u.system_role, "is_active": u.is_active}


@router.delete("/users/{uid}")
def delete_user(uid: str, admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    if uid == admin.id:
        raise HTTPException(400, "Нельзя удалить себя")
    u = db.get(models.User, uid)
    if u is None:
        raise HTTPException(404, "пользователь не найден")
    # PRAGMA foreign_keys=ON включён, но чистим связи явно и снимаем файлы загрузок с диска
    paths = set()
    for pm in db.query(models.ProjectMember).filter_by(user_id=uid).all():
        db.delete(pm)
    for p in db.query(models.Project).filter_by(user_id=uid).all():
        paths.update(mm.file_path for mm in p.meetings if mm.file_path)
        db.delete(p)  # cascade relationship на projects.meetings снимет и встречи
    for m in db.query(models.Meeting).filter_by(user_id=uid).all():
        if m.file_path:
            paths.add(m.file_path)
        db.delete(m)
    db.delete(u)
    db.commit()
    for path in paths:  # файл мог быть переиспользован встречей другого пользователя (дедуп по hash)
        if not db.query(models.Meeting).filter(models.Meeting.file_path == path).count():
            try:
                Path(path).unlink(missing_ok=True)
            except OSError:
                pass
    return {"ok": True}


@router.get("/projects")
def all_projects(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    out = []
    for p in db.query(models.Project).order_by(models.Project.updated_at.desc()).all():
        out.append({"id": p.id, "name": p.name, "owner": p.owner.name if p.owner else "—",
                    "owner_email": p.owner.email if p.owner else "",
                    "meetings_count": len(p.meetings),
                    "members_count": len(p.members),
                    "updated_at": schemas.iso_utc(p.updated_at)})
    return out


@router.get("/activity")
def activity(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    recent = db.query(models.Meeting).order_by(models.Meeting.created_at.desc()).limit(12).all()
    return {
        "users": db.query(func.count(models.User.id)).scalar(),
        "projects": db.query(func.count(models.Project.id)).scalar(),
        "meetings": db.query(func.count(models.Meeting.id)).scalar(),
        "done": db.query(func.count(models.Meeting.id)).filter(models.Meeting.status == "done").scalar(),
        "recent": [{"id": m.id, "title": m.title, "status": m.status,
                    "user": m.user.name if m.user else "—",
                    "project": m.project.name if m.project else "—",
                    "created_at": schemas.iso_utc(m.created_at)} for m in recent],
    }
