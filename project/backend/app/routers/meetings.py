import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, PlainTextResponse
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..db import get_db
from ..deps import accessible_project, get_current_user, own_meeting, own_requirement
from ..services import media, pipeline
from ..services.pipeline import UPLOAD_DIR

router = APIRouter(prefix="/api")

ALLOWED_EXT = media.AUDIO_EXT | media.VIDEO_EXT

USER_FORMATS = "mp3, wav, m4a, aac, ogg, flac, mp4, mov, avi, mkv, webm"


def _req_out(r: models.Requirement) -> schemas.RequirementOut:
    out = schemas.RequirementOut.model_validate(r)
    out.source = schemas.SourceOut(
        text=r.source_text,
        start_time=_fmt(r.source_start_sec), end_time=_fmt(r.source_end_sec))
    return out


def _fmt(sec: float | None) -> str | None:
    if sec is None:
        return None
    sec = int(sec)
    return f"{sec // 3600:02d}:{sec % 3600 // 60:02d}:{sec % 60:02d}"


@router.post("/meetings", response_model=schemas.MeetingOut)
async def create_meeting(background: BackgroundTasks, file: UploadFile = File(...),
                         title: str = Form("Встреча"), project_id: str | None = Form(None),
                         analyze: bool = Form(True),
                         user: models.User = Depends(get_current_user),
                         db: Session = Depends(get_db)):
    ext = Path(file.filename or "").suffix.lower()
    if ext not in ALLOWED_EXT:
        raise HTTPException(400, f"файл .{ext} не поддерживается, нужны: {sorted(ALLOWED_EXT)}")
    if not (1 <= len(title) <= 200):
        raise HTTPException(400, "название встречи 1-200 символов")

    if project_id:
        project, role = accessible_project(project_id, user, db, min_role="editor")
    else:  # своя последняя либо новый личный «Мои встречи»; чужие доступные (viewer) не используем
        project = (db.query(models.Project).filter(models.Project.user_id == user.id)
                   .order_by(models.Project.updated_at.desc()).first())
        if project is None:
            project = models.Project(user_id=user.id, name="Мои встречи")
            db.add(project)
            db.commit()
            db.refresh(project)

    UPLOAD_DIR.mkdir(exist_ok=True)
    # уникальное имя: два файла с одинаковым названием не пишутся в один путь
    path = UPLOAD_DIR / f"up_{uuid.uuid4().hex}{ext}"
    size = 0
    with open(path, "wb") as f:
        while chunk := await file.read(1 << 20):
            size += len(chunk)
            if size > settings.max_upload_mb * 1024 * 1024:
                f.close()
                path.unlink(missing_ok=True)
                raise HTTPException(413, f"файл больше {settings.max_upload_mb} МБ")
            f.write(chunk)
    if size == 0:
        path.unlink(missing_ok=True)
        raise HTTPException(400, "пустой файл")
    # не доверяем расширению: реальный контейнер по магическим байтам
    if media.detect_kind(path) is None:
        path.unlink(missing_ok=True)
        raise HTTPException(400, f"Формат не поддерживается. Можно: {USER_FORMATS}")

    fhash = pipeline.file_hash(path)
    cached = pipeline.find_cached_meeting(db, fhash, user.id)
    if cached:
        if cached.file_path and Path(cached.file_path).exists():
            path.unlink(missing_ok=True)
        else:
            keep = UPLOAD_DIR / f"{cached.id}{ext}"
            shutil.move(str(path), str(keep))
            cached.file_path = str(keep)
        if project_id and cached.project_id != project.id:
            cached.project_id = project.id  # явно выбранный проект: встреча видна в нём, а не в старом
        db.commit()
        return _meeting_out(cached)

    meeting = models.Meeting(title=title[:200], file_hash=fhash, status="uploaded",
                             user_id=user.id, project_id=project.id, file_path=str(path))
    db.add(meeting)
    db.commit()
    if analyze:
        background.add_task(pipeline.process_meeting, meeting.id, path)
    return _meeting_out(meeting)


@router.post("/meetings/{meeting_id}/process")
def start_processing(meeting_id: str, background: BackgroundTasks,
                     user: models.User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    """Запуск/повтор пайплайна по уже загруженному файлу (ручной старт или после ошибки)."""
    m, _ = own_meeting(meeting_id, user, db, min_role="editor")
    if m.status not in ("uploaded", "error"):
        raise HTTPException(409, "встреча уже обрабатывается")
    if not m.file_path or not Path(m.file_path).exists():
        raise HTTPException(409, "файл записи недоступен — загрузите встречу заново")
    for r in m.requirements:
        db.delete(r)
    for q in m.open_questions:
        db.delete(q)
    for x in m.contradictions:
        db.delete(x)
    for s in m.segments:
        db.delete(s)
    m.error = None
    m.summary = None
    m.duration_sec = None
    db.commit()
    background.add_task(pipeline.process_meeting, m.id, Path(m.file_path))
    return {"ok": True}


def _meeting_out(m: models.Meeting, project_role: str | None = None) -> schemas.MeetingOut:
    out = schemas.MeetingOut.model_validate(m)
    out.is_video = bool(m.file_path and Path(m.file_path).suffix.lower() in media.VIDEO_EXT)
    out.project_id = m.project_id
    out.project_name = m.project.name if m.project else None
    out.project_role = project_role
    return out


def meeting_detail(m: models.Meeting, db: Session, project_role: str | None = None) -> schemas.MeetingDetail:
    reqs = [_req_out(r) for r in m.requirements if r.type != "constraint"]
    constraints = [_req_out(r) for r in m.requirements if r.type == "constraint"]
    roles = sorted({s.speaker for s in m.segments if s.speaker})
    return schemas.MeetingDetail(
        meeting=_meeting_out(m, project_role), requirements=reqs, roles=roles, constraints=constraints,
        open_questions=[
            schemas.OpenQuestionOut.model_validate(q).model_copy(
                update={"requirement_public_id":
                        (db.get(models.Requirement, q.requirement_id).public_id if q.requirement_id else None)})
            for q in m.open_questions],
        contradictions=[schemas.ContradictionOut.model_validate(x) for x in m.contradictions],
        counts={
            "requirements": len(reqs),
            "questions": sum(1 for q in m.open_questions if not q.resolved),
            "needs_clarification": sum(1 for r in m.requirements if r.needs_clarification),
            "contradictions": len(m.contradictions),
        },
    )


def meeting_row(m: models.Meeting) -> dict:
    return {
        "id": m.id, "title": m.title, "status": m.status,
        "duration_sec": m.duration_sec, "created_at": schemas.iso_utc(m.created_at),
        "requirements_count": len(m.requirements),
        "roles_count": len({s.speaker for s in m.segments if s.speaker}),
        "contradictions_count": len(m.contradictions),
        "questions_count": sum(1 for q in m.open_questions if not q.resolved),
        "is_video": bool(m.file_path and Path(m.file_path).suffix.lower() in media.VIDEO_EXT),
        "project_id": m.project_id,
        "project_name": m.project.name if m.project else None,
    }


@router.get("/meetings")
def list_meetings(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # глобальная лента «Встречи» = созданные мной; чужие проекты доступны через /projects/{pid}/meetings
    ms = (db.query(models.Meeting).filter(models.Meeting.user_id == user.id)
          .order_by(models.Meeting.created_at.desc()).all())
    return [meeting_row(m) for m in ms]


@router.get("/meetings/{meeting_id}", response_model=schemas.MeetingDetail)
def get_meeting(meeting_id: str, user: models.User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    m, role = own_meeting(meeting_id, user, db)
    return meeting_detail(m, db, role)


@router.delete("/meetings/{meeting_id}")
def delete_meeting(meeting_id: str, user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    m, _ = own_meeting(meeting_id, user, db, min_role="editor")
    path = m.file_path
    db.delete(m)
    db.commit()
    if path:
        still_used = db.query(models.Meeting).filter(models.Meeting.file_path == path).count()
        if not still_used:
            try:  # unlink не должен превращать успешное удаление в 500 (Windows-блокировки)
                Path(path).unlink(missing_ok=True)
            except OSError:
                pass
    return {"ok": True}


@router.get("/meetings/{meeting_id}/transcript")
def get_transcript(meeting_id: str, user: models.User = Depends(get_current_user),
                   db: Session = Depends(get_db)):
    m, _ = own_meeting(meeting_id, user, db)
    segs = sorted(m.segments, key=lambda s: s.start_sec)
    return [schemas.SegmentOut.model_validate(s) for s in segs]


@router.post("/meetings/{meeting_id}/requirements", response_model=schemas.RequirementOut)
def add_requirement(meeting_id: str, body: schemas.RequirementCreate,
                    user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    m, _ = own_meeting(meeting_id, user, db, min_role="editor")
    used = {r.public_id for r in m.requirements}
    n = len(used) + 1
    while f"REQ-{n:03d}" in used:
        n += 1
    r = models.Requirement(meeting_id=m.id, public_id=f"REQ-{n:03d}", title=body.title,
                           description=body.description, priority=body.priority,
                           type=body.type, manual=True, confidence=1.0)
    db.add(r)
    db.commit()
    return _req_out(r)


@router.patch("/requirements/{req_id}", response_model=schemas.RequirementOut)
def patch_requirement(req_id: str, body: schemas.RequirementPatch,
                      user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = own_requirement(req_id, user, db)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(r, k, v)
    db.commit()
    return _req_out(r)


@router.delete("/requirements/{req_id}")
def delete_requirement(req_id: str, user: models.User = Depends(get_current_user),
                       db: Session = Depends(get_db)):
    r = own_requirement(req_id, user, db)
    db.delete(r)
    db.commit()
    return {"ok": True}


@router.patch("/open-questions/{q_id}")
def resolve_question(q_id: str, user: models.User = Depends(get_current_user),
                     db: Session = Depends(get_db)):
    q = db.get(models.OpenQuestion, q_id)
    if q is None:
        raise HTTPException(404, "вопрос не найден")
    own_meeting(q.meeting_id, user, db, min_role="editor")
    q.resolved = not q.resolved
    db.commit()
    return {"id": q.id, "resolved": q.resolved}


@router.post("/requirements/{req_id}/question", response_model=schemas.QuestionOut)
def ask_about_requirement(req_id: str, body: schemas.QuestionCreate,
                          user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    r = own_requirement(req_id, user, db)
    q = models.OpenQuestion(meeting_id=r.meeting_id, requirement_id=r.id, description=body.description)
    r.needs_clarification = True
    db.add(q)
    db.commit()
    return q


@router.get("/meetings/{meeting_id}/audio")
def get_audio(meeting_id: str, user: models.User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    m, _ = own_meeting(meeting_id, user, db)
    if not m.file_path or not Path(m.file_path).exists():
        raise HTTPException(404, "аудио недоступно")
    return FileResponse(m.file_path)


@router.patch("/contradictions/{x_id}/resolve")
def resolve_contradiction(x_id: str, user: models.User = Depends(get_current_user),
                          db: Session = Depends(get_db)):
    x = db.get(models.Contradiction, x_id)
    if x is None:
        raise HTTPException(404, "противоречие не найдено")
    own_meeting(x.meeting_id, user, db, min_role="editor")
    x.resolved = not x.resolved
    db.commit()
    return {"id": x.id, "resolved": x.resolved}


@router.get("/meetings/{meeting_id}/export", response_class=PlainTextResponse)
def export_tz(meeting_id: str, user: models.User = Depends(get_current_user),
              db: Session = Depends(get_db)):
    m, _ = own_meeting(meeting_id, user, db)
    lines = [f"# Техническое задание — {m.title}", "",
             "_Сформировано X<актион> ТехЗадание из разговора. Дата встречи: "
             f"{m.created_at:%d.%m.%Y}_", ""]
    groups = [("Функциональные требования", "functional"), ("Нефункциональные требования", "non-functional")]
    for header, typ in groups:
        items = [r for r in m.requirements if r.type == typ]
        if not items:
            continue
        lines += [f"## {header}", ""]
        for r in items:
            mark = " ⚠️ требует уточнения" if r.needs_clarification else ""
            lines += [f"### {r.public_id}. {r.title}{mark}", r.description,
                      f"*Приоритет: {r.priority} · Уверенность: {int(r.confidence * 100)}%*", ""]
    cons = [r for r in m.requirements if r.type == "constraint"]
    if cons:
        lines += ["## Ограничения"] + [f"- {c.description}" for c in cons] + [""]
    qs = [q for q in m.open_questions if not q.resolved]
    if qs:
        lines += ["## Открытые вопросы"] + [f"- {q.description}" for q in qs] + [""]
    xs = m.contradictions
    if xs:
        lines += ["## Обнаруженные противоречия"]
        for x in xs:
            lines += [f"- **[{x.requirement_public_ids}]** {x.description}",
                      f"  Рекомендация: {x.recommendation}"]
        lines += [""]
    us = [us for r in m.requirements for us in r.user_stories]
    if us:
        lines += ["## User Stories"] + [f"- Как {u.role}, я хочу {u.action}, чтобы {u.goal}" for u in us]
    return "\n".join(lines)
