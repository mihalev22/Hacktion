"""Хеширование паролей (scrypt, stdlib) и JWT (PyJWT, HS256)."""
import base64
import hashlib
import hmac
import secrets
import time

import jwt

from .config import settings

ALGORITHM = "HS256"
ACCESS = "access"
REFRESH = "refresh"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1, dklen=32,
                        maxmem=256 * 1024 * 1024)
    return "scrypt$%s$%s" % (base64.b64encode(salt).decode(), base64.b64encode(dk).decode())


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_b64, dk_b64 = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        want = base64.b64decode(dk_b64)
        got = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**15, r=8, p=1, dklen=len(want),
                             maxmem=256 * 1024 * 1024)
        return hmac.compare_digest(want, got)
    except (ValueError, TypeError):
        return False


def create_token(user_id: str, kind: str, expires_sec: int) -> str:
    now = int(time.time())
    return jwt.encode({"sub": user_id, "typ": kind, "iat": now, "exp": now + expires_sec,
                       "jti": secrets.token_hex(8)},
                      settings.jwt_secret, ALGORITHM)


def create_pair(user_id: str) -> tuple[str, str]:
    return (create_token(user_id, ACCESS, settings.access_token_expire_minutes * 60),
            create_token(user_id, REFRESH, settings.refresh_token_expire_days * 24 * 3600))


def decode_token(token: str, kind: str) -> str | None:
    """Возвращает user_id, если токен валиден и это нужный тип."""
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None
    if payload.get("typ") != kind:
        return None
    return payload.get("sub")
