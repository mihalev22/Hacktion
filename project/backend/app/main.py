import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import inspect, text

import json

from . import models
from .config import settings
from .db import Base, engine, SessionLocal
from .security import hash_password
from .routers import meetings, auth, projects, admin

Base.metadata.create_all(bind=engine)


def _migrate_auth_columns() -> None:
    """SQLite-safe лёгкая миграция: users/Meeting.project_id + demo + бэкфилл проектов."""
    cols = {c["name"] for c in inspect(engine).get_columns("meetings")}
    ucols = {c["name"] for c in inspect(engine).get_columns("users")}
    with engine.begin() as conn:
        if "user_id" not in cols:
            conn.execute(text("ALTER TABLE meetings ADD COLUMN user_id VARCHAR(32)"))
        if "project_id" not in cols:
            conn.execute(text("ALTER TABLE meetings ADD COLUMN project_id VARCHAR(32)"))
        if "system_role" not in ucols:
            conn.execute(text("ALTER TABLE users ADD COLUMN system_role VARCHAR(10) DEFAULT 'user'"))

    db = SessionLocal()
    try:
        demo = db.query(models.User).filter(models.User.email.in_(["demo@requirex.app", "demo@akcion.tech"])).first()
        if demo is None and settings.show_demo_hint:
            # демо-аккаунт — обычный user: пароль виден на экране входа и не должен давать admin-доступ
            demo = models.User(email="demo@akcion.tech", name="Demo", system_role="user",
                               password_hash=hash_password("xtz-demo"))
            db.add(demo)
            db.commit()
            db.refresh(demo)
        else:
            changed = False
            if demo is not None and demo.email == "demo@requirex.app":
                demo.email = "demo@akcion.tech"
                demo.password_hash = hash_password("xtz-demo")
                changed = True
            if demo is not None and demo.system_role == "admin":
                demo.system_role = "user"
                changed = True
                logging.info("migrate: демо-аккаунт понижен до user (админ назначается через ADMIN_EMAIL)")
            if changed:
                db.commit()

        # каждая существующая встреча получает проект «Мои встречи» своего пользователя
        if demo is not None:
            orphaned = db.query(models.Meeting).filter(models.Meeting.user_id.is_(None)).update(
                {models.Meeting.user_id: demo.id})
            if orphaned:
                db.commit()
        no_project = db.query(models.Meeting).filter(models.Meeting.project_id.is_(None)).all()
        by_user: dict[str, str] = {}
        for m in no_project:
            pid = by_user.get(m.user_id)
            if not pid:
                p = models.Project(user_id=m.user_id, name="Мои встречи",
                                   description="Встречи, загруженные до появления проектов")
                db.add(p)
                db.flush()
                pid = p.id
                by_user[m.user_id] = pid
            m.project_id = pid
        if no_project:
            db.commit()
            logging.info("migrate: %d встреч помещены в проекты «Мои встречи»", len(no_project))
        # админ: сначала по ADMIN_EMAIL; если не задан — первому реальному (не демо) пользователю
        if not db.query(models.User).filter(models.User.system_role == "admin").count():
            target = None
            if settings.admin_email:
                target = db.query(models.User).filter(
                    models.User.email == settings.admin_email.strip().lower()).first()
            if target is None:
                target = (db.query(models.User)
                          .filter(models.User.email.notin_(["demo@akcion.tech", "demo@requirex.app"]))
                          .order_by(models.User.created_at).first())
            if target:
                target.system_role = "admin"
                db.commit()
                logging.info("migrate: %s назначен администратором", target.email)
            elif settings.admin_email:
                logging.info("migrate: ADMIN_EMAIL %s ещё не зарегистрирован — станет админом при регистрации",
                             settings.admin_email)
    finally:
        db.close()


def _recover_stuck_meetings() -> None:
    """Пайплайн живёт в памяти процесса: после рестарта встречи «в обработке» зависли навсегда."""
    db = SessionLocal()
    try:
        stuck = db.query(models.Meeting).filter(
            models.Meeting.status.in_(["extracting", "transcribing", "analyzing"])).all()
        for m in stuck:
            m.status = "error"
            m.error = "Обработка прервалась из-за перезапуска сервера. Нажмите «Повторить» — файл сохранён."
        if stuck:
            db.commit()
            logging.info("recovery: %d зависших встреч помечены ошибкой (можно повторить без загрузки)", len(stuck))
    finally:
        db.close()


def _cleanup_orphans() -> None:
    db = SessionLocal()
    try:
        meeting_ids = db.query(models.Meeting.id)
        req_ids = db.query(models.Requirement.id)
        seg_ids = db.query(models.TranscriptSegment.id)
        n = 0
        n += db.query(models.Requirement).filter(
            models.Requirement.source_segment_id.isnot(None),
            ~models.Requirement.source_segment_id.in_(seg_ids)
        ).update({models.Requirement.source_segment_id: None}, synchronize_session=False)
        n += db.query(models.UserStory).filter(~models.UserStory.requirement_id.in_(req_ids)) \
            .delete(synchronize_session=False)
        n += db.query(models.Requirement).filter(~models.Requirement.meeting_id.in_(meeting_ids)) \
            .delete(synchronize_session=False)
        n += db.query(models.TranscriptSegment).filter(~models.TranscriptSegment.meeting_id.in_(meeting_ids)) \
            .delete(synchronize_session=False)
        n += db.query(models.OpenQuestion).filter(~models.OpenQuestion.meeting_id.in_(meeting_ids)) \
            .delete(synchronize_session=False)
        n += db.query(models.Contradiction).filter(~models.Contradiction.meeting_id.in_(meeting_ids)) \
            .delete(synchronize_session=False)
        db.commit()
        if n:
            logging.info("cleanup: удалено %d осиротевших записей", n)
    finally:
        db.close()


_migrate_auth_columns()
_cleanup_orphans()
_recover_stuck_meetings()

app = FastAPI(title="X<актион> ТехЗадание API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(projects.router)
app.include_router(admin.router)
app.include_router(meetings.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/config")
def public_config():
    return {"demo_hint": settings.show_demo_hint}


@app.get("/api/mock")
def mock():
    from pathlib import Path
    return json.loads((Path(__file__).resolve().parents[1] / "mock" / "mock_data.json").read_text(encoding="utf-8"))
