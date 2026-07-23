from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user
from ..db import get_session
from ..models import ChatMessageRow, ChatSession, ShareLink, User, now_ms


router = APIRouter(prefix="/api/chat-sessions", tags=["chat"])


class SessionOut(BaseModel):
    id: int
    title: str
    kb_id: int | None = None
    created_at: int
    updated_at: int


@router.get("", response_model=list[SessionOut])
def list_sessions(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[SessionOut]:
    rows = session.exec(
        select(ChatSession)
        .where(ChatSession.owner_user_id == user.id)
        .order_by(ChatSession.updated_at.desc())
    ).all()
    return [
        SessionOut(id=r.id, title=r.title, kb_id=r.kb_id, created_at=r.created_at, updated_at=r.updated_at)  # type: ignore[arg-type]
        for r in rows
    ]


class SessionCreate(BaseModel):
    title: str | None = Field(default=None, max_length=120)
    system_prompt: str | None = Field(default=None, max_length=8000)
    kb_id: int | None = None


@router.post("", response_model=SessionOut)
def create_session(
    payload: SessionCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SessionOut:
    title = (payload.title or "New chat").strip() or "New chat"
    s = ChatSession(
        owner_user_id=user.id,
        title=title,
        kb_id=payload.kb_id,
        created_at=now_ms(),
        updated_at=now_ms(),
    )
    session.add(s)
    session.commit()
    session.refresh(s)

    sys_prompt = (payload.system_prompt or "").strip()
    if sys_prompt:
        session.add(
            ChatMessageRow(session_id=s.id, role="system", content=sys_prompt, created_at=now_ms())  # type: ignore[arg-type]
        )
        session.commit()

    write_audit(session, actor=user, action="chat.session.create", resource=f"chat_session:{s.id}")
    return SessionOut(id=s.id, title=s.title, kb_id=s.kb_id, created_at=s.created_at, updated_at=s.updated_at)  # type: ignore[arg-type]


class SessionUpdate(BaseModel):
    kb_id: int | None = None


@router.put("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SessionOut:
    s = session.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
    if not s or s.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    s.kb_id = payload.kb_id
    s.updated_at = now_ms()
    session.add(s)
    session.commit()
    session.refresh(s)
    return SessionOut(id=s.id, title=s.title, kb_id=s.kb_id, created_at=s.created_at, updated_at=s.updated_at)  # type: ignore[arg-type]


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    created_at: int


@router.get("/{session_id}/messages", response_model=list[MessageOut])
def list_messages(
    session_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MessageOut]:
    s = session.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
    if not s or s.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    rows = session.exec(
        select(ChatMessageRow).where(ChatMessageRow.session_id == session_id).order_by(ChatMessageRow.created_at.asc())
    ).all()
    return [
        MessageOut(id=r.id, role=r.role, content=r.content, created_at=r.created_at)  # type: ignore[arg-type]
        for r in rows
    ]


@router.delete("/{session_id}")
def delete_session(
    session_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    s = session.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
    if not s or s.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    msgs = session.exec(select(ChatMessageRow).where(ChatMessageRow.session_id == session_id)).all()
    for m in msgs:
        session.delete(m)
    links = session.exec(select(ShareLink).where(ShareLink.session_id == session_id)).all()
    for l in links:
        session.delete(l)
    session.delete(s)
    session.commit()
    write_audit(session, actor=user, action="chat.session.delete", resource=f"chat_session:{session_id}")
    return {"ok": True}


@router.get("/{session_id}/export")
def export_session(
    session_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    s = session.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
    if not s or s.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    rows = session.exec(
        select(ChatMessageRow).where(ChatMessageRow.session_id == session_id).order_by(ChatMessageRow.created_at.asc())
    ).all()
    return {
        "session": {"id": s.id, "title": s.title, "created_at": s.created_at, "updated_at": s.updated_at},
        "messages": [{"role": r.role, "content": r.content, "created_at": r.created_at} for r in rows],
    }


class ShareCreateOut(BaseModel):
    token: str


@router.post("/{session_id}/share", response_model=ShareCreateOut)
def create_share_link(
    session_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> ShareCreateOut:
    s = session.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
    if not s or s.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Session not found")
    token = secrets.token_urlsafe(24)
    link = ShareLink(session_id=session_id, token=token, created_at=now_ms())
    session.add(link)
    session.commit()
    write_audit(session, actor=user, action="chat.session.share", resource=f"chat_session:{session_id}")
    return ShareCreateOut(token=token)


@router.get("/shared/{token}")
def get_shared(token: str, session: Session = Depends(get_session)) -> dict:
    link = session.exec(select(ShareLink).where(ShareLink.token == token)).first()
    if not link or link.revoked_at is not None:
        raise HTTPException(status_code=404, detail="Not found")
    s = session.exec(select(ChatSession).where(ChatSession.id == link.session_id)).first()
    if not s:
        raise HTTPException(status_code=404, detail="Not found")
    rows = session.exec(
        select(ChatMessageRow).where(ChatMessageRow.session_id == s.id).order_by(ChatMessageRow.created_at.asc())
    ).all()
    return {
        "session": {"title": s.title, "created_at": s.created_at, "updated_at": s.updated_at},
        "messages": [{"role": r.role, "content": r.content, "created_at": r.created_at} for r in rows],
    }

