"""Зависимости FastAPI: текущий пользователь, системная роль и доступ к проектам.

Три независимые «роли»:
  system_role  admin|user            — права в приложении
  project role owner|editor|viewer   — доступ к проекту (project_members)
  AI roles     Менеджер/Аналитик/…   — данные транскрипции, тут не участвуют
"""
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from . import models
from .db import get_db
from .security import ACCESS, REFRESH, decode_token

bearer = HTTPBearer(auto_error=False)

ACCESS_COOKIE = "rx_access"
REFRESH_COOKIE = "rx_refresh"

ROLE_RANK = {"viewer": 0, "editor": 1, "owner": 2}


def get_current_user(request: Request,
                     creds: HTTPAuthorizationCredentials | None = Depends(bearer),
                     db: Session = Depends(get_db)) -> models.User:
    token = creds.credentials if creds else request.cookies.get(ACCESS_COOKIE)
    uid = decode_token(token, ACCESS) if token else None
    if not uid:
        raise HTTPException(401, "Требуется авторизация")
    user = db.get(models.User, uid)
    if user is None or not user.is_active:
        raise HTTPException(401, "Требуется авторизация")
    return user


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user.system_role != "admin":
        raise HTTPException(403, "Только для администратора")
    return user


def refresh_uid_from_cookie(request: Request) -> str | None:
    return decode_token(request.cookies.get(REFRESH_COOKIE, ""), REFRESH)


def project_role(user: models.User, project: models.Project, db: Session) -> str | None:
    if user.system_role == "admin":
        return "owner"
    if project.user_id == user.id:
        return "owner"
    m = db.query(models.ProjectMember).filter_by(project_id=project.id, user_id=user.id).first()
    return m.role if m else None


def accessible_project(pid: str, user: models.User, db: Session,
                       min_role: str = "viewer") -> tuple[models.Project, str]:
    p = db.get(models.Project, pid)
    if p is None:
        raise HTTPException(404, "проект не найден")
    role = project_role(user, p, db)
    if role is None:
        raise HTTPException(403, "Нет доступа к проекту")
    if ROLE_RANK[role] < ROLE_RANK[min_role]:
        raise HTTPException(403, "Недостаточно прав")
    return p, role


def own_meeting(meeting_id: str, user: models.User, db: Session,
                min_role: str = "viewer") -> tuple[models.Meeting, str | None]:
    """Доступ к встрече через её проект; у встреч без проекта — только создатель."""
    m = db.get(models.Meeting, meeting_id)
    if m is None:
        raise HTTPException(404, "встреча не найдена")
    if m.project_id:
        p, role = accessible_project(m.project_id, user, db, min_role)
        return m, role
    is_creator = m.user_id == user.id or user.system_role == "admin"
    if not is_creator:
        raise HTTPException(403, "Нет доступа к встрече")
    if min_role != "viewer" and m.user_id != user.id and user.system_role != "admin":
        raise HTTPException(403, "Недостаточно прав: изменение доступно владельцу встречи")
    return m, "owner"


def own_requirement(req_id: str, user: models.User, db: Session,
                    min_role: str = "editor") -> models.Requirement:
    r = db.get(models.Requirement, req_id)
    if r is None:
        raise HTTPException(404, "требование не найдено")
    own_meeting(r.meeting_id, user, db, min_role)
    return r
