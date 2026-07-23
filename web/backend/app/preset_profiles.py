"""
First-time seeding for model profiles: OpenAI-compatible (when API key is set, from .env or DB)
and Ollama local (tags from Ollama HTTP API, or preset list from .env / DB).

Runs only when the user has zero ModelProfile rows.
"""

from __future__ import annotations

import httpx
from sqlmodel import Session, select

from .audit import write_audit
from .models import ActiveModelProfile, ModelProfile, User, now_ms
from .runtime_kv import (
    merged_copaw_ollama_preset_models_raw,
    merged_copaw_preset_models_raw,
    merged_openai_api_key,
    merged_openai_base_url,
    merged_ollama_base_url,
)

# (display name, model id) — OpenAI-compatible
DEFAULT_OPENAI_PRESETS: list[tuple[str, str]] = [
    ("GPT-4.1 mini", "gpt-4.1-mini"),
    ("GPT-4.1", "gpt-4.1"),
    ("GPT-4o mini", "gpt-4o-mini"),
    ("GPT-4o", "gpt-4o"),
]


def _openai_presets_from_session(session: Session) -> list[tuple[str, str]] | None:
    raw = merged_copaw_preset_models_raw(session)
    if not raw:
        return None
    out: list[tuple[str, str]] = []
    for part in raw.split(","):
        mid = part.strip()
        if len(mid) < 1:
            continue
        out.append((mid[:80], mid[:120]))
    return out or None


def _fetch_ollama_model_names(session: Session) -> list[str]:
    base = merged_ollama_base_url(session)
    url = f"{base}/api/tags"
    try:
        with httpx.Client(timeout=12.0) as client:
            r = client.get(url)
            r.raise_for_status()
            data = r.json()
    except Exception:
        return []
    out: list[str] = []
    for m in data.get("models", []):
        name = str(m.get("name") or "").strip()
        if name:
            out.append(name)
    return sorted(set(out))


def _ollama_presets_from_session(session: Session) -> list[str]:
    raw = merged_copaw_ollama_preset_models_raw(session) or ""
    if not raw.strip():
        return []
    return [p.strip()[:120] for p in raw.split(",") if p.strip()]


def sync_ollama_model_profiles(session: Session, user: User) -> None:
    """对已登录用户：根据 Ollama `/api/tags` 补全缺失的本地模型档案（不清除已有项）。
    每次列出模型档案前调用，以便 `ollama pull` 的新模型出现在下拉里。"""
    ollama_names = _fetch_ollama_model_names(session)
    if not ollama_names:
        return
    v1 = f"{merged_ollama_base_url(session)}/v1"
    added_any = False
    for model in ollama_names:
        exists = session.exec(
            select(ModelProfile).where(
                ModelProfile.owner_user_id == user.id,
                ModelProfile.base_url == v1,
                ModelProfile.api_key == "ollama",
                ModelProfile.model == model,
            )
        ).first()
        if exists:
            continue
        ts = now_ms()
        session.add(
            ModelProfile(
                owner_user_id=user.id,
                name=f"Ollama · {model}"[:80],
                provider="openai_compat",
                base_url=v1,
                api_key="ollama",
                model=model,
                rpm_limit=0,
                created_at=ts,
                updated_at=ts,
            )
        )
        added_any = True
    if added_any:
        session.commit()


def ensure_preset_profiles(session: Session, user: User) -> None:
    existing = session.exec(select(ModelProfile).where(ModelProfile.owner_user_id == user.id)).first()
    if existing is not None:
        return

    ts = now_ms()
    openai_added: list[tuple[str, str]] = []
    ollama_added: list[str] = []

    api_key = merged_openai_api_key(session)
    if api_key:
        openai_added = _openai_presets_from_session(session) or DEFAULT_OPENAI_PRESETS
        base_url = merged_openai_base_url(session)
        for name, model in openai_added:
            session.add(
                ModelProfile(
                    owner_user_id=user.id,
                    name=name,
                    provider="openai_compat",
                    base_url=base_url,
                    api_key=api_key,
                    model=model,
                    rpm_limit=60,
                    created_at=ts,
                    updated_at=ts,
                )
            )

    ollama_names = _fetch_ollama_model_names(session)
    if not ollama_names:
        ollama_names = _ollama_presets_from_session(session)

    v1 = f"{merged_ollama_base_url(session)}/v1"
    for model in ollama_names:
        label = f"Ollama · {model}"
        session.add(
            ModelProfile(
                owner_user_id=user.id,
                name=label[:80],
                provider="openai_compat",
                base_url=v1,
                api_key="ollama",
                model=model,
                rpm_limit=0,
                created_at=ts,
                updated_at=ts,
            )
        )
        ollama_added.append(model)

    if not openai_added and not ollama_added:
        return

    session.commit()

    rows = list(
        session.exec(select(ModelProfile).where(ModelProfile.owner_user_id == user.id).order_by(ModelProfile.id)).all()
    )
    if not rows:
        return

    active = session.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
    if not active:
        first = rows[0]
        session.add(
            ActiveModelProfile(
                owner_user_id=user.id,
                model_profile_id=first.id,  # type: ignore[arg-type]
                updated_at=now_ms(),
            )
        )
        session.commit()

    write_audit(
        session,
        actor=user,
        action="model.presets.seed",
        resource="openai_compat+ollama",
        meta={
            "openai_count": len(openai_added),
            "openai_models": [m for _, m in openai_added],
            "ollama_count": len(ollama_added),
            "ollama_models": ollama_added,
        },
    )
