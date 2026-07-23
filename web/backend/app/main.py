from __future__ import annotations

import time
from collections.abc import AsyncIterator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse

from .config import settings
import os

from sqlmodel import Session, select

from .auth import hash_password
from .db import engine, init_db
from .models import User, now_ms
from .providers import ProviderError, get_provider
from .routers.auth import router as auth_router
from .routers.users import router as users_router
from .routers.teams import router as teams_router
from .routers.admin import router as admin_router
from .routers.chat_sessions import router as chat_sessions_router
from .routers.chat_run import router as chat_run_router
from .routers.models import router as models_router
from .routers.kb import router as kb_router
from .routers.system import router as system_router
from .routers.settings_runtime import router as settings_runtime_router
from .schemas import ChatRequest, ChatSseEvent


app = FastAPI(title="CoPaw Backend", version="0.1.0")

if settings.cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

@app.on_event("startup")
def _startup() -> None:
    init_db()
    _bootstrap_admin()


def _bootstrap_admin() -> None:
    email = (os.getenv("BOOTSTRAP_ADMIN_EMAIL") or "").strip()
    password = (os.getenv("BOOTSTRAP_ADMIN_PASSWORD") or "").strip()
    if not email or not password:
        return
    with Session(engine) as session:
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            changed = False
            if user.role != "admin":
                user.role = "admin"
                changed = True
            if password:
                user.password_hash = hash_password(password)
                changed = True
            if changed:
                user.updated_at = now_ms()
                session.add(user)
                session.commit()
            return
        user = User(
            email=email,
            name="Admin",
            password_hash=hash_password(password),
            role="admin",
            is_active=True,
            created_at=now_ms(),
            updated_at=now_ms(),
        )
        session.add(user)
        session.commit()


app.include_router(auth_router)
app.include_router(users_router)
app.include_router(teams_router)
app.include_router(admin_router)
app.include_router(chat_sessions_router)
app.include_router(chat_run_router)
app.include_router(models_router)
app.include_router(kb_router)
app.include_router(system_router)
app.include_router(settings_runtime_router)


@app.get("/health")
async def health() -> dict:
    return {"ok": True, "env": settings.app_env}


def _sse(event: ChatSseEvent) -> bytes:
    return f"data: {event.model_dump_json()}\n\n".encode("utf-8")


async def _event_stream(req: ChatRequest) -> AsyncIterator[bytes]:
    provider = get_provider()
    meta = provider.meta()
    yield _sse(ChatSseEvent(type="meta", data={"provider": meta.name, "model": meta.model}))

    started = time.time()
    try:
        async for tok in provider.stream_chat(req):
            yield _sse(ChatSseEvent(type="delta", data={"text": tok}))
        elapsed_ms = int((time.time() - started) * 1000)
        yield _sse(ChatSseEvent(type="done", data={"elapsed_ms": elapsed_ms}))
    except ProviderError as e:
        yield _sse(ChatSseEvent(type="error", data={"message": str(e)}))
    except Exception:
        yield _sse(ChatSseEvent(type="error", data={"message": "Unexpected server error"}))


@app.post("/api/chat/stream")
async def chat_stream(req: ChatRequest):
    return StreamingResponse(_event_stream(req), media_type="text/event-stream")


@app.get("/api/config")
async def get_config():
    """
    Returns non-sensitive runtime config for the web console.
    """
    provider = get_provider()
    meta = provider.meta()
    return JSONResponse(
        {
            "provider": meta.name,
            "model": meta.model,
            "auth_disabled": settings.auth_disabled,
        }
    )

