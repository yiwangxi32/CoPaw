from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user
from ..db import get_session
from ..models import ActiveModelProfile, ModelProfile, User, now_ms
from ..preset_profiles import ensure_preset_profiles, sync_ollama_model_profiles
from ..runtime_kv import merged_openai_api_key


router = APIRouter(prefix="/api/models", tags=["models"])


class ModelProfileOut(BaseModel):
    id: int
    name: str
    provider: str
    base_url: str
    model: str
    rpm_limit: int
    created_at: int
    updated_at: int
    is_active: bool = False
    is_ready: bool = True


class ModelProfileCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    provider: str = Field(default="openai_compat")
    base_url: str = Field(default="https://api.openai.com/v1")
    api_key: str = Field(default="", min_length=0, max_length=500)
    model: str = Field(default="gpt-4.1-mini", min_length=1, max_length=120)
    rpm_limit: int = Field(default=60, ge=0, le=6000)


class ModelProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)
    base_url: str | None = None
    api_key: str | None = Field(default=None, min_length=0, max_length=500)
    model: str | None = Field(default=None, min_length=1, max_length=120)
    rpm_limit: int | None = Field(default=None, ge=0, le=6000)


@router.get("/profiles", response_model=list[ModelProfileOut])
def list_profiles(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[ModelProfileOut]:
    ensure_preset_profiles(session, user)
    sync_ollama_model_profiles(session, user)
    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    active_id = active.model_profile_id if active else None
    rows = session.exec(select(ModelProfile).where(ModelProfile.owner_user_id == user.id).order_by(ModelProfile.updated_at.desc())).all()
    merged_key = merged_openai_api_key(session)
    out: list[ModelProfileOut] = []
    for r in rows:
        base = (r.base_url or "").lower()
        is_ollama = "11434" in base or "ollama" in base
        key = (r.api_key or "").strip()
        if key.lower() == "runtime":
            key = (merged_key or "").strip()
        is_ready = True if is_ollama else bool(key)
        out.append(
            ModelProfileOut(
                id=r.id,  # type: ignore[arg-type]
                name=r.name,
                provider=r.provider,
                base_url=r.base_url,
                model=r.model,
                rpm_limit=r.rpm_limit,
                created_at=r.created_at,
                updated_at=r.updated_at,
                is_active=(r.id == active_id),
                is_ready=is_ready,
            )
        )
    return out


@router.post("/profiles", response_model=ModelProfileOut)
def create_profile(
    payload: ModelProfileCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ModelProfileOut:
    r = ModelProfile(
        owner_user_id=user.id,
        name=payload.name.strip(),
        provider=payload.provider.strip() or "openai_compat",
        base_url=payload.base_url.strip() or "https://api.openai.com/v1",
        api_key=payload.api_key.strip(),
        model=payload.model.strip(),
        rpm_limit=payload.rpm_limit,
        created_at=now_ms(),
        updated_at=now_ms(),
    )
    session.add(r)
    session.commit()
    session.refresh(r)
    write_audit(session, actor=user, action="model.profile.create", resource=f"model_profile:{r.id}")
    base = (r.base_url or "").lower()
    is_ollama = "11434" in base or "ollama" in base
    key = (r.api_key or "").strip()
    if key.lower() == "runtime":
        key = (merged_openai_api_key(session) or "").strip()
    return ModelProfileOut(
        id=r.id,  # type: ignore[arg-type]
        name=r.name,
        provider=r.provider,
        base_url=r.base_url,
        model=r.model,
        rpm_limit=r.rpm_limit,
        created_at=r.created_at,
        updated_at=r.updated_at,
        is_active=False,
        is_ready=(True if is_ollama else bool(key)),
    )


@router.put("/profiles/{profile_id}", response_model=ModelProfileOut)
def update_profile(
    profile_id: int,
    payload: ModelProfileUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ModelProfileOut:
    r = session.exec(select(ModelProfile).where(ModelProfile.id == profile_id, ModelProfile.owner_user_id == user.id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Profile not found")
    if payload.name is not None:
        r.name = payload.name.strip()
    if payload.base_url is not None:
        r.base_url = payload.base_url.strip()
    if payload.api_key is not None:
        r.api_key = payload.api_key.strip()
    if payload.model is not None:
        r.model = payload.model.strip()
    if payload.rpm_limit is not None:
        r.rpm_limit = payload.rpm_limit
    r.updated_at = now_ms()
    session.add(r)
    session.commit()
    session.refresh(r)
    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    is_active = active.model_profile_id == r.id if active else False
    write_audit(session, actor=user, action="model.profile.update", resource=f"model_profile:{r.id}")
    base = (r.base_url or "").lower()
    is_ollama = "11434" in base or "ollama" in base
    key = (r.api_key or "").strip()
    if key.lower() == "runtime":
        key = (merged_openai_api_key(session) or "").strip()
    return ModelProfileOut(
        id=r.id,  # type: ignore[arg-type]
        name=r.name,
        provider=r.provider,
        base_url=r.base_url,
        model=r.model,
        rpm_limit=r.rpm_limit,
        created_at=r.created_at,
        updated_at=r.updated_at,
        is_active=is_active,
        is_ready=(True if is_ollama else bool(key)),
    )


@router.delete("/profiles/{profile_id}")
def delete_profile(
    profile_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    r = session.exec(select(ModelProfile).where(ModelProfile.id == profile_id, ModelProfile.owner_user_id == user.id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Profile not found")
    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    if active and active.model_profile_id == r.id:
        session.delete(active)
    session.delete(r)
    session.commit()
    write_audit(session, actor=user, action="model.profile.delete", resource=f"model_profile:{profile_id}")
    return {"ok": True}


class SetActiveReq(BaseModel):
    profile_id: int


@router.post("/active")
def set_active(
    payload: SetActiveReq,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    r = session.exec(select(ModelProfile).where(ModelProfile.id == payload.profile_id, ModelProfile.owner_user_id == user.id)).first()
    if not r:
        raise HTTPException(status_code=404, detail="Profile not found")
    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    if active:
        active.model_profile_id = r.id  # type: ignore[assignment]
        active.updated_at = now_ms()
        session.add(active)
    else:
        session.add(ActiveModelProfile(owner_user_id=user.id, model_profile_id=r.id, updated_at=now_ms()))
    session.commit()
    write_audit(session, actor=user, action="model.profile.activate", resource=f"model_profile:{r.id}")
    return {"ok": True}


@router.get("/active")
def get_active(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    if not active:
        return {"active_profile_id": None}
    return {"active_profile_id": active.model_profile_id}

