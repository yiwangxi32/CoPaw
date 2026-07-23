from __future__ import annotations

import time
from typing import Optional

from sqlmodel import Field, SQLModel, UniqueConstraint


def now_ms() -> int:
    return int(time.time() * 1000)


class User(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    name: str = Field(default="")
    password_hash: str
    role: str = Field(default="user", index=True)  # user | admin
    is_active: bool = Field(default=True, index=True)
    created_at: int = Field(default_factory=now_ms, index=True)
    updated_at: int = Field(default_factory=now_ms, index=True)


class AuditLog(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    actor_user_id: Optional[int] = Field(default=None, index=True)
    action: str = Field(index=True)
    resource: str = Field(default="", index=True)
    meta_json: str = Field(default="{}")
    created_at: int = Field(default_factory=now_ms, index=True)


class Team(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(index=True)
    slug: str = Field(index=True, unique=True)
    created_at: int = Field(default_factory=now_ms, index=True)
    updated_at: int = Field(default_factory=now_ms, index=True)


class TeamMember(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("team_id", "user_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    team_id: int = Field(index=True, foreign_key="team.id")
    user_id: int = Field(index=True, foreign_key="user.id")
    role: str = Field(default="member", index=True)  # owner | admin | member
    created_at: int = Field(default_factory=now_ms, index=True)


class ChatSession(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: int = Field(index=True, foreign_key="user.id")
    team_id: Optional[int] = Field(default=None, index=True, foreign_key="team.id")
    kb_id: Optional[int] = Field(default=None, index=True, foreign_key="knowledgebase.id")
    title: str = Field(default="New chat", index=True)
    created_at: int = Field(default_factory=now_ms, index=True)
    updated_at: int = Field(default_factory=now_ms, index=True)


class ChatMessageRow(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="chatsession.id")
    role: str = Field(index=True)  # system | user | assistant | tool
    content: str = Field(default="")
    created_at: int = Field(default_factory=now_ms, index=True)


class ShareLink(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    session_id: int = Field(index=True, foreign_key="chatsession.id")
    token: str = Field(index=True, unique=True)
    created_at: int = Field(default_factory=now_ms, index=True)
    revoked_at: Optional[int] = Field(default=None, index=True)


class ModelProfile(SQLModel, table=True):
    """
    Stores user-owned model/provider configs. API keys are stored as plaintext for now.
    For production, add encryption-at-rest (master key) and secret-rotation.
    """

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: int = Field(index=True, foreign_key="user.id")
    name: str = Field(index=True)  # display name
    provider: str = Field(default="openai_compat", index=True)
    base_url: str = Field(default="https://api.openai.com/v1")
    api_key: str = Field(default="")
    model: str = Field(default="gpt-4.1-mini", index=True)
    rpm_limit: int = Field(default=60, index=True)  # requests per minute
    created_at: int = Field(default_factory=now_ms, index=True)
    updated_at: int = Field(default_factory=now_ms, index=True)


class ActiveModelProfile(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("owner_user_id"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: int = Field(index=True, foreign_key="user.id")
    model_profile_id: int = Field(index=True, foreign_key="modelprofile.id")
    updated_at: int = Field(default_factory=now_ms, index=True)


class KnowledgeBase(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    owner_user_id: int = Field(index=True, foreign_key="user.id")
    name: str = Field(index=True)
    created_at: int = Field(default_factory=now_ms, index=True)
    updated_at: int = Field(default_factory=now_ms, index=True)


class KbDocument(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kb_id: int = Field(index=True, foreign_key="knowledgebase.id")
    owner_user_id: int = Field(index=True, foreign_key="user.id")
    filename: str = Field(index=True)
    mime_type: str = Field(default="")
    size_bytes: int = Field(default=0)
    created_at: int = Field(default_factory=now_ms, index=True)


class KbChunk(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    kb_id: int = Field(index=True, foreign_key="knowledgebase.id")
    doc_id: int = Field(index=True, foreign_key="kbdocument.id")
    idx: int = Field(index=True)
    text: str = Field(default="")
    created_at: int = Field(default_factory=now_ms, index=True)


class RuntimeSetting(SQLModel, table=True):
    """Key/value overrides for provider URLs, API keys, and preset model lists (see runtime_kv)."""

    key: str = Field(primary_key=True, max_length=64)
    value: str = Field(default="", max_length=8000)

