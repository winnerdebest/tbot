from urllib.parse import urlparse, parse_qs, urlencode, urlunparse
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # Environment ("development" | "production")
    ENVIRONMENT: str = "development"

    # Database (Neon / PostgreSQL — required in .env / Render Environment)
    DATABASE_URL: str = ""

    # Encryption & Session Secrets (required in .env / Render Environment, min 16 chars)
    ENCRYPTION_KEY: str = ""
    SESSION_SECRET: str = ""
    SESSION_COOKIE_NAME: str = "ani_session"
    SESSION_TTL_DAYS: int = 14

    # Telegram MTProto App Credentials (loaded strictly from .env / Render Environment)
    API_ID: int | None = None
    API_HASH: str | None = None

    # Google OAuth 2.0 Credentials (loaded strictly from .env / Render Environment)
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_REDIRECT_URI: str = ""
    FRONTEND_URL: str = ""

    # Server & CORS (loaded strictly from .env / Render Environment)
    PORT: int = 8000
    CORS_ORIGINS: str = ""

    @field_validator("API_ID", mode="before")
    @classmethod
    def _parse_api_id(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return int(v)

    @field_validator("API_HASH", mode="before")
    @classmethod
    def _parse_api_hash(cls, v):
        if v is None or (isinstance(v, str) and not v.strip()):
            return None
        return str(v).strip()

    @property
    def is_production(self) -> bool:
        return self.ENVIRONMENT.strip().lower() == "production"

    @property
    def cors_origin_list(self) -> list[str]:
        origins = [o.strip() for o in self.CORS_ORIGINS.split(",") if o.strip()]
        if self.FRONTEND_URL.strip() and self.FRONTEND_URL.strip() not in origins:
            origins.append(self.FRONTEND_URL.strip())
        return origins

    def validate_required_secrets(self) -> None:
        missing = []
        if not self.DATABASE_URL.strip():
            missing.append("DATABASE_URL")
        if len(self.ENCRYPTION_KEY.strip()) < 16:
            missing.append("ENCRYPTION_KEY (min 16 chars)")
        if len(self.SESSION_SECRET.strip()) < 16:
            missing.append("SESSION_SECRET (min 16 chars)")
        if missing:
            raise RuntimeError(
                f"Missing required environment variables: {', '.join(missing)}. "
                "Configure them in backend/.env or your Render Environment settings."
            )

    @property
    def async_database_url(self) -> str:
        """Convert standard postgresql:// URL to postgresql+asyncpg:// and strip unsupported asyncpg query params."""
        raw = self.DATABASE_URL.strip()
        if not raw:
            raise ValueError("DATABASE_URL is not configured in environment")
        if raw.startswith("postgres://"):
            raw = "postgresql+asyncpg://" + raw[len("postgres://") :]
        elif raw.startswith("postgresql://"):
            raw = "postgresql+asyncpg://" + raw[len("postgresql://") :]

        parsed = urlparse(raw)
        qs = parse_qs(parsed.query)
        qs.pop("sslmode", None)
        qs.pop("channel_binding", None)
        new_query = urlencode(qs, doseq=True)
        return urlunparse(parsed._replace(query=new_query))


settings = Settings()
