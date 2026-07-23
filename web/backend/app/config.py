from __future__ import annotations

import os

from dotenv import load_dotenv


def _getenv(name: str, default: str | None = None) -> str | None:
    v = os.getenv(name)
    if v is None:
        return default
    v = v.strip()
    return v if v != "" else default


class Settings:
    def __init__(self) -> None:
        load_dotenv()

        self.app_env = _getenv("APP_ENV", "dev")
        self.app_host = _getenv("APP_HOST", "127.0.0.1") or "127.0.0.1"
        self.app_port = int(_getenv("APP_PORT", "8787") or "8787")

        self.cors_origins_raw = _getenv("CORS_ORIGINS", "http://localhost:5173")
        self.provider = _getenv("PROVIDER", "openai_compat") or "openai_compat"

        self.openai_base_url = _getenv("OPENAI_BASE_URL", "https://api.openai.com/v1") or "https://api.openai.com/v1"
        self.openai_api_key = _getenv("OPENAI_API_KEY", "") or ""
        self.openai_model = _getenv("OPENAI_MODEL", "gpt-4.1-mini") or "gpt-4.1-mini"
        self.auth_disabled = (_getenv("AUTH_DISABLED", "true") or "true").lower() in ("1", "true", "yes", "y")

    @property
    def cors_origins(self) -> list[str]:
        raw = (self.cors_origins_raw or "").strip()
        if raw == "*":
            return ["*"]
        return [s.strip() for s in raw.split(",") if s.strip()]


settings = Settings()

