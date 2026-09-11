"""Авторизация: регистрация, вход, refresh (HttpOnly cookie), logout, профиль."""
import time

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from .. import models, schemas
from ..config import settings
from ..db import get_db
from ..deps import ACCESS_COOKIE, REFRESH_COOKIE, get_current_user, refresh_uid_from_cookie
from ..security import ACCESS, REFRESH, create_pair, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])

_rate: dict[str, list[float]] = {}


def _check_rate(key: str, limit: int, window: int = 60) -> None:
    now = time.time()
    hits = [t for t in _rate.get(key, []) if now - t < window]
    if len(hits) >= limit:
        _rate[key] = hits
        raise HTTPException(429, "Слишком много попыток. Подождите минуту.")
    _rate[key] = hits


def _hit(key: str, window: int = 60) -> None:
    _rate.setdefault(key, []).append(time.time())
    _rate[key] = [t for t in _rate[key] if time.time() - t < window]
    if len(_rate) > 5000:  # чистим протухшие ключи, чтобы словарь не рос бесконечно
        now = time.time()
        for k in [k for k, v in _rate.items() if not any(now - t < window for t in v)]:
            _rate.pop(k, None)


def _ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _set_cookies(res: Response, access: str, refresh: str) -> None:
    common = dict(httponly=True, samesite="lax", secure=settings.cookie_secure)
    res.set_cookie(ACCESS_COOKIE, access, max_age=settings.access_token_expire_minutes * 60,
                   path="/api", **common)
    res.set_cookie(REFRESH_COOKIE, refresh, max_age=settings.refresh_token_expire_days * 24 * 3600,
                   path="/api/auth", **common)


def _clear_cookies(res: Response) -> None:
    res.delete_cookie(ACCESS_COOKIE, path="/api")
    res.delete_cookie(REFRESH_COOKIE, path="/api/auth")


@router.post("/register", response_model=schemas.UserOut, status_code=201)
def register(body: schemas.RegisterIn, res: Response, request: Request, db: Session = Depends(get_db)):
    _check_rate("reg:" + _ip(request), limit=20)
    _hit("reg:" + _ip(request))
    if body.password != body.password_confirm:
        raise HTTPException(422, "Пароли не совпадают")
    if db.query(models.User).filter(models.User.email == body.email).first():
        raise HTTPException(409, "Этот email уже зарегистрирован")
    user = models.User(email=body.email, name=body.name, password_hash=hash_password(body.password))
    if settings.admin_email and body.email == settings.admin_email.strip().lower():
        if not db.query(models.User).filter(models.User.system_role == "admin").count():
            user.system_role = "admin"
    db.add(user)
    db.commit()
    db.refresh(user)
    access, refresh = create_pair(user.id)
    _set_cookies(res, access, refresh)
    return schemas.UserOut(id=user.id, email=user.email, name=user.name, system_role=user.system_role)


@router.post("/login", response_model=schemas.UserOut)
def login(body: schemas.LoginIn, res: Response, request: Request, db: Session = Depends(get_db)):
    # лимиты на НЕУДАЧНЫЕ попытки: успешные повторные входы не должны ловить 429 на демо
    ip = _ip(request)
    _check_rate(f"login-ip:{ip}", limit=40)
    _check_rate(f"login-mail:{body.email}", limit=8)
    user = db.query(models.User).filter(models.User.email == body.email).first()
    if user is None or not verify_password(body.password, user.password_hash):
        _hit(f"login-ip:{ip}")
        _hit(f"login-mail:{body.email}")
        raise HTTPException(401, "Неверный email или пароль")
    if not user.is_active:
        raise HTTPException(403, "Учётная запись заблокирована. Обратитесь к администратору.")
    access, refresh = create_pair(user.id)
    _set_cookies(res, access, refresh)
    return schemas.UserOut(id=user.id, email=user.email, name=user.name, system_role=user.system_role)


@router.post("/refresh")
def refresh(res: Response, request: Request, db: Session = Depends(get_db)):
    uid = refresh_uid_from_cookie(request)
    if not uid:
        raise HTTPException(401, "Сессия истекла")
    user = db.get(models.User, uid)
    if user is None or not user.is_active:
        raise HTTPException(401, "Сессия истекла")
    access, refresh_tok = create_pair(user.id)
    _set_cookies(res, access, refresh_tok)
    return {"ok": True, "access_token": access}


@router.post("/logout")
def logout(res: Response):
    _clear_cookies(res)
    return {"ok": True}


@router.get("/me", response_model=schemas.UserOut)
def me(user: models.User = Depends(get_current_user)):
    return schemas.UserOut(id=user.id, email=user.email, name=user.name, system_role=user.system_role)


@router.patch("/me", response_model=schemas.UserOut)
def patch_me(body: schemas.NamePatch, user: models.User = Depends(get_current_user),
             db: Session = Depends(get_db)):
    user.name = body.name
    db.commit()
    return schemas.UserOut(id=user.id, email=user.email, name=user.name, system_role=user.system_role)
