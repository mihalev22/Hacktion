from pathlib import Path

from pydantic_settings import BaseSettings

ENV_PATH = Path(__file__).resolve().parents[1] / ".env"


class Settings(BaseSettings):
    s2t_api_key: str = ""
    gigachat_client_id: str = ""
    gigachat_client_secret: str = ""
    database_url: str = f"sqlite:///{(Path(__file__).resolve().parents[1] / 'requirex.db').as_posix()}"
    max_upload_mb: int = 200
    demo_mode: bool = False
    jwt_secret: str = ""
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    cookie_secure: bool = False  # True только за HTTPS (prod)
    admin_email: str = ""  # email, которому при регистрации/старте выдаётся system_role=admin
    show_demo_hint: bool = True  # false на публичном сервере: скрывает демо-подсказку на экране входа
    # TLS Sber (ngw.devices.sberbank.ru) идёт в self-signed цепочке — официальное решение:
    # положить корневой сертификат Сбера в файл и указать GIGACHAT_CA_BUNDLE=path к нему.
    # Пустой bundle + verify=false — осознанный компромисс хакатона (см. README «Безопасность»).
    gigachat_ca_bundle: str = ""
    gigachat_verify: bool = False

    class Config:
        env_file = str(ENV_PATH)


settings = Settings()

if not settings.jwt_secret:
    import secrets
    import warnings
    warnings.warn("JWT_SECRET не задан — сгенерирован временный (сессии слетят после рестарта)")
    settings.jwt_secret = secrets.token_urlsafe(48)
