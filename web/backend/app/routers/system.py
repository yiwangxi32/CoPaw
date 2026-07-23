from __future__ import annotations

import httpx
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import get_current_user
from ..db import get_session
from ..models import ActiveModelProfile, ModelProfile, User, now_ms
from ..runtime_kv import merged_ollama_base_url
from ..tools import list_tool_specs


router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/heartbeat")
def heartbeat(user: User = Depends(get_current_user)) -> dict:
    return {
        "ok": True,
        "user": {"email": user.email, "role": user.role},
        "message": "System heartbeat is healthy.",
    }


@router.get("/tools")
def tools_meta(user: User = Depends(get_current_user)) -> dict:
    return {
        "ok": True,
        "tools": [
            {
                "name": spec.name,
                "description": spec.description,
                "parameters": spec.parameters,
            }
            for spec in list_tool_specs()
        ],
    }


@router.get("/mcp")
def mcp_meta(user: User = Depends(get_current_user)) -> dict:
    # Local, static MCP view for the desktop console.
    return {
        "ok": True,
        "servers": [
            {"name": "cursor-app-control", "status": "enabled"},
            {"name": "cursor-ide-browser", "status": "enabled"},
            {"name": "user-blender", "status": "enabled"},
        ],
    }


@router.get("/ollama/models")
async def list_ollama_models(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    del user
    base = merged_ollama_base_url(session)
    url = f"{base}/api/tags"
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            r = await client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama unavailable: {e}")

    models = []
    for m in data.get("models", []):
        name = str(m.get("name") or "").strip()
        if name:
            models.append(name)
    return {"ok": True, "models": sorted(set(models))}


class ActivateOllamaReq(BaseModel):
    model: str


class PullOllamaReq(BaseModel):
    model: str


@router.post("/ollama/activate")
def activate_ollama_model(
    payload: ActivateOllamaReq,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    model_name = (payload.model or "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="Model is required")

    ollama_v1 = f"{merged_ollama_base_url(session)}/v1"
    profile_name = "Ollama Local"
    profile = session.exec(
        select(ModelProfile).where(
            ModelProfile.owner_user_id == user.id,
            ModelProfile.name == profile_name,
        )
    ).first()

    if profile:
        profile.provider = "openai_compat"
        profile.base_url = ollama_v1
        profile.api_key = "ollama"
        profile.model = model_name
        profile.updated_at = now_ms()
        session.add(profile)
        session.commit()
        session.refresh(profile)
    else:
        profile = ModelProfile(
            owner_user_id=user.id,
            name=profile_name,
            provider="openai_compat",
            base_url=ollama_v1,
            api_key="ollama",
            model=model_name,
            rpm_limit=0,
            created_at=now_ms(),
            updated_at=now_ms(),
        )
        session.add(profile)
        session.commit()
        session.refresh(profile)

    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    if active:
        active.model_profile_id = profile.id  # type: ignore[assignment]
        active.updated_at = now_ms()
        session.add(active)
    else:
        session.add(
            ActiveModelProfile(
                owner_user_id=user.id,
                model_profile_id=profile.id,  # type: ignore[arg-type]
                updated_at=now_ms(),
            )
        )
    session.commit()

    return {"ok": True, "provider": "openai_compat", "model": model_name}


@router.post("/ollama/pull")
async def pull_ollama_model(
    payload: PullOllamaReq,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    del user
    model_name = (payload.model or "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="Model is required")

    base = merged_ollama_base_url(session)
    url = f"{base}/api/pull"
    try:
        async with httpx.AsyncClient(timeout=1800.0) as client:
            r = await client.post(url, json={"model": model_name, "stream": False})
            if r.status_code >= 400:
                # Bubble up Ollama errors so the UI can decide whether to fallback to API-key config.
                raise HTTPException(status_code=r.status_code, detail=r.text[:800])
            data = r.json() if r.content else {}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama pull failed: {e}")

    return {"ok": True, "model": model_name, "status": data.get("status") or "success"}

