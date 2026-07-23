from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session

from ..audit import write_audit
from ..auth import get_current_user
from ..config import settings
from ..db import get_session
from ..models import User
from ..runtime_kv import (
    KEY_COPAW_OLLAMA_PRESET_MODELS,
    KEY_COPAW_PRESET_MODELS,
    KEY_OLLAMA_BASE_URL,
    KEY_OPENAI_API_KEY,
    KEY_OPENAI_BASE_URL,
    KEY_OPENAI_DEFAULT_MODEL,
    api_key_hint,
    kv_delete,
    kv_upsert,
    merged_copaw_ollama_preset_models_raw,
    merged_copaw_preset_models_raw,
    merged_openai_api_key,
    merged_openai_base_url,
    merged_openai_model,
    merged_ollama_base_url,
)

router = APIRouter(prefix="/api/settings", tags=["settings"])


def _require_settings_user(user: User) -> User:
    if settings.auth_disabled:
        return user
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="需要管理员权限")
    return user


def _require_settings_dep(user: User = Depends(get_current_user)) -> User:
    return _require_settings_user(user)


class RuntimeSettingsOut(BaseModel):
    openai_base_url: str
    openai_default_model: str
    openai_api_key_set: bool
    openai_api_key_hint: str
    ollama_base_url: str
    copaw_preset_models: str
    copaw_ollama_preset_models: str


class RuntimeSettingsUpdate(BaseModel):
    openai_base_url: str | None = Field(default=None, max_length=500)
    openai_default_model: str | None = Field(default=None, max_length=120)
    openai_api_key: str | None = Field(default=None, max_length=500)
    clear_openai_api_key: bool = Field(default=False)
    ollama_base_url: str | None = Field(default=None, max_length=500)
    copaw_preset_models: str | None = Field(default=None, max_length=2000)
    copaw_ollama_preset_models: str | None = Field(default=None, max_length=2000)


def _build_runtime_settings_out(session: Session) -> RuntimeSettingsOut:
    key = merged_openai_api_key(session)
    return RuntimeSettingsOut(
        openai_base_url=merged_openai_base_url(session),
        openai_default_model=merged_openai_model(session),
        openai_api_key_set=bool(key),
        openai_api_key_hint=api_key_hint(key),
        ollama_base_url=merged_ollama_base_url(session),
        copaw_preset_models=merged_copaw_preset_models_raw(session) or "",
        copaw_ollama_preset_models=merged_copaw_ollama_preset_models_raw(session) or "",
    )


def _validate_openai_api_key(*, base_url: str, api_key: str) -> None:
    base = (base_url or "").strip().rstrip("/") or "https://api.openai.com/v1"
    key = (api_key or "").strip()
    if not key:
        raise HTTPException(status_code=400, detail="API Key 不能为空")
    url = f"{base}/models"
    headers = {"Authorization": f"Bearer {key}"}
    try:
        with httpx.Client(timeout=8.0) as client:
            r = client.get(url, headers=headers)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"API Key 校验失败：无法连接模型服务（{e}）")

    if r.status_code >= 400:
        text = (r.text or "")[:300]
        raise HTTPException(status_code=400, detail=f"API Key 校验失败：{r.status_code} {text}")


@router.get("/runtime", response_model=RuntimeSettingsOut)
def get_runtime_settings(
    session: Session = Depends(get_session),
    _user: User = Depends(_require_settings_dep),
) -> RuntimeSettingsOut:
    del _user
    return _build_runtime_settings_out(session)


@router.put("/runtime", response_model=RuntimeSettingsOut)
def put_runtime_settings(
    payload: RuntimeSettingsUpdate,
    session: Session = Depends(get_session),
    user: User = Depends(_require_settings_dep),
) -> RuntimeSettingsOut:
    candidate_base = (payload.openai_base_url or "").strip() if payload.openai_base_url is not None else merged_openai_base_url(session)
    candidate_key = (payload.openai_api_key or "").strip() if payload.openai_api_key is not None else merged_openai_api_key(session)

    if payload.clear_openai_api_key:
        candidate_key = ""

    # Real validation: reject saving arbitrary/invalid API key.
    if payload.openai_api_key is not None and candidate_key:
        _validate_openai_api_key(base_url=candidate_base, api_key=candidate_key)

    if payload.clear_openai_api_key:
        kv_delete(session, KEY_OPENAI_API_KEY)
    elif payload.openai_api_key is not None:
        v = payload.openai_api_key.strip()
        if v:
            kv_upsert(session, KEY_OPENAI_API_KEY, v)
        else:
            kv_delete(session, KEY_OPENAI_API_KEY)

    def _opt_str(field: str | None, key: str) -> None:
        if field is None:
            return
        s = field.strip()
        if s:
            kv_upsert(session, key, s)
        else:
            kv_delete(session, key)

    _opt_str(payload.openai_base_url, KEY_OPENAI_BASE_URL)
    _opt_str(payload.openai_default_model, KEY_OPENAI_DEFAULT_MODEL)
    _opt_str(payload.ollama_base_url, KEY_OLLAMA_BASE_URL)
    _opt_str(payload.copaw_preset_models, KEY_COPAW_PRESET_MODELS)
    _opt_str(payload.copaw_ollama_preset_models, KEY_COPAW_OLLAMA_PRESET_MODELS)

    session.commit()

    write_audit(
        session,
        actor=user,
        action="settings.runtime.update",
        resource="runtime",
        meta={},
    )

    return _build_runtime_settings_out(session)
