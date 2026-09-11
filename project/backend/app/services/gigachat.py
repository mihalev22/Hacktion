"""GigaChat API (SberWave OAuth + completions)."""
import json
import time
import uuid

import requests
import urllib3

from ..config import settings

TOKEN_URL = "https://ngw.devices.sberbank.ru:9443/api/v2/oauth"
SCOPE = "GIGACHAT_API_PERS"
API_URL = "https://api.giga.chat/v1"


def _verify() -> bool | str:
    """GIGACHAT_CA_BUNDLE=path → проверяем цепочку Сбера по их корневому сертификату (безопасно).
    Иначе GIGACHAT_VERIFY_SSL; false — осознанный компромисс хакатона (см. README)."""
    if settings.gigachat_ca_bundle:
        return settings.gigachat_ca_bundle
    if not settings.gigachat_verify:
        urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
    return settings.gigachat_verify

_token_cache = {"token": "", "exp": 0.0}


def _token() -> str:
    if _token_cache["token"] and time.time() < _token_cache["exp"] - 60:
        return _token_cache["token"]
    if not settings.gigachat_client_id or not settings.gigachat_client_secret:
        raise RuntimeError("GIGACHAT_CLIENT_ID / GIGACHAT_CLIENT_SECRET не заданы в .env")
    resp = requests.post(
        TOKEN_URL,
        headers={
            "Content-Type": "application/x-www-form-urlencoded",
            "Accept": "application/json",
            "RqUID": str(uuid.uuid4()),
        },
        data={"scope": SCOPE},
        auth=(settings.gigachat_client_id, settings.gigachat_client_secret),
        timeout=60,
        verify=_verify(),
    )
    if resp.status_code != 200:
        raise RuntimeError(f"OAuth failed {resp.status_code}: {resp.text[:300]}")
    data = resp.json()
    _token_cache["token"] = data["access_token"]
    _token_cache["exp"] = time.time() + 25 * 60
    return _token_cache["token"]


def chat(messages: list[dict], model: str = "GigaChat-3-Ultra", temperature: float = 0.2) -> str:
    resp = requests.post(
        f"{API_URL}/chat/completions",
        headers={"Authorization": f"Bearer {_token()}"},
        json={
            "model": model,
            "messages": messages,
            "temperature": temperature,
        },
        timeout=300,
        verify=_verify(),
    )
    resp.raise_for_status()
    return resp.json()["choices"][0]["message"]["content"]


def chat_json(messages: list[dict], **kwargs) -> dict:
    raw = chat(messages, **kwargs)
    start, end = raw.find("{"), raw.rfind("}")
    return json.loads(raw[start : end + 1])
