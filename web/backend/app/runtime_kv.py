"""SQLite-backed overrides for values otherwise read from environment (see .env.example)."""

from __future__ import annotations

import os

from sqlmodel import Session, select

from .config import settings
from .models import RuntimeSetting

KEY_OPENAI_API_KEY = "openai_api_key"
KEY_OPENAI_BASE_URL = "openai_base_url"
KEY_OPENAI_DEFAULT_MODEL = "openai_default_model"
KEY_OLLAMA_BASE_URL = "ollama_base_url"
KEY_COPAW_PRESET_MODELS = "copaw_preset_models"
KEY_COPAW_OLLAMA_PRESET_MODELS = "copaw_ollama_preset_models"

# 当数据库与 .env 均未配置时：用于首次生成 Ollama 模型档案（连不上 /api/tags 时仍可出现 llama3.1）
_DEFAULT_COPAW_OLLAMA_PRESET_MODELS = "llama3.1"


def _row_value(session: Session, key: str) -> str | None:
    row = session.exec(select(RuntimeSetting).where(RuntimeSetting.key == key)).first()
    if not row:
        return None
    v = (row.value or "").strip()
    return v if v else None


def kv_upsert(session: Session, key: str, value: str) -> None:
    row = session.exec(select(RuntimeSetting).where(RuntimeSetting.key == key)).first()
    if row:
        row.value = value
        session.add(row)
    else:
        session.add(RuntimeSetting(key=key, value=value))


def kv_delete(session: Session, key: str) -> None:
    row = session.exec(select(RuntimeSetting).where(RuntimeSetting.key == key)).first()
    if row:
        session.delete(row)


def merged_openai_api_key(session: Session) -> str:
    v = _row_value(session, KEY_OPENAI_API_KEY)
    if v is not None:
        return v
    return (settings.openai_api_key or "").strip()


def merged_openai_base_url(session: Session) -> str:
    v = _row_value(session, KEY_OPENAI_BASE_URL)
    if v is not None:
        return v
    return (settings.openai_base_url or "https://api.openai.com/v1").strip() or "https://api.openai.com/v1"


def merged_openai_model(session: Session) -> str:
    v = _row_value(session, KEY_OPENAI_DEFAULT_MODEL)
    if v is not None:
        return v
    return (settings.openai_model or "gpt-4.1-mini").strip() or "gpt-4.1-mini"


def merged_ollama_base_url(session: Session) -> str:
    v = _row_value(session, KEY_OLLAMA_BASE_URL)
    if v is not None:
        return v.rstrip("/")
    raw = (os.getenv("OLLAMA_BASE_URL") or "http://127.0.0.1:11434").strip().rstrip("/")
    return raw or "http://127.0.0.1:11434"


def merged_copaw_preset_models_raw(session: Session) -> str | None:
    v = _row_value(session, KEY_COPAW_PRESET_MODELS)
    if v is not None:
        return v
    raw = (os.getenv("COPAW_PRESET_MODELS") or "").strip()
    return raw or None


def merged_copaw_ollama_preset_models_raw(session: Session) -> str | None:
    v = _row_value(session, KEY_COPAW_OLLAMA_PRESET_MODELS)
    if v is not None:
        return v
    raw = (os.getenv("COPAW_OLLAMA_PRESET_MODELS") or "").strip()
    if raw:
        return raw
    return _DEFAULT_COPAW_OLLAMA_PRESET_MODELS


def api_key_hint(secret: str) -> str:
    s = (secret or "").strip()
    if len(s) <= 4:
        return "****" if s else ""
    return f"…{s[-4:]}"
