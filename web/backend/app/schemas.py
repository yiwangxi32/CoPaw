from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"] = Field(...)
    content: str = Field(..., min_length=0)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(default_factory=list)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    max_output_tokens: int | None = Field(default=None, ge=1, le=32768)


class ChatSessionStreamRequest(BaseModel):
    user_message: str = Field(..., min_length=1, max_length=20000)
    temperature: float | None = Field(default=None, ge=0.0, le=2.0)
    top_p: float | None = Field(default=None, ge=0.0, le=1.0)
    max_output_tokens: int | None = Field(default=None, ge=1, le=32768)


class ChatSseEvent(BaseModel):
    type: Literal["meta", "delta", "done", "error"]
    data: dict

