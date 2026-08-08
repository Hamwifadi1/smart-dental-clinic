from functools import lru_cache

from dotenv import load_dotenv
from pydantic import BaseModel
from starlette.config import Config

load_dotenv()

config = Config(".env")


class Settings(BaseModel):
    database_url: str = config(
        "DATABASE_URL",
        default="postgresql+psycopg://postgres:postgres@localhost:5432/dental_clinic_chatbot?connect_timeout=5",
    )
    jwt_secret_key: str = config("JWT_SECRET_KEY", default="change-this-secret-key")
    jwt_expire_minutes: int = config("JWT_EXPIRE_MINUTES", cast=int, default=120)
    smtp_host: str = config("SMTP_HOST", default="")
    smtp_port: int = config("SMTP_PORT", cast=int, default=587)
    smtp_username: str = config("SMTP_USERNAME", default="")
    smtp_password: str = config("SMTP_PASSWORD", default="")
    smtp_from_email: str = config("SMTP_FROM_EMAIL", default="")
    smtp_use_tls: bool = config("SMTP_USE_TLS", cast=bool, default=True)


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
