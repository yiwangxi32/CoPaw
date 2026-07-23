from __future__ import annotations

import json
import re
import time
import asyncio
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user
from ..db import engine
from ..models import ActiveModelProfile, ChatMessageRow, ChatSession, ModelProfile, User, now_ms
from ..providers import ProviderError, get_provider, get_provider_from_profile
from ..rag import build_context_block, retrieve_chunks
from ..rate_limit import allow_request
from ..schemas import ChatMessage, ChatRequest, ChatSessionStreamRequest, ChatSseEvent
from ..runtime_kv import merged_openai_api_key
from ..tools import ToolError, format_tool_result, openai_tools_payload, run_tool


router = APIRouter(prefix="/api/chat-sessions", tags=["chat"])


def _sse(event: ChatSseEvent) -> bytes:
    return f"data: {event.model_dump_json()}\n\n".encode("utf-8")


def _derive_title(text: str) -> str:
    line = (text or "").strip().split("\n")[0].strip()
    line = line[:40]
    return line or "New chat"


def _is_tools_unsupported_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "does not support tools" in msg or "tool_calls" in msg


def _is_rate_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "429" in msg or "rate limit" in msg or "ratelimit" in msg


def _extract_retry_after_seconds(exc: Exception) -> int:
    msg = str(exc)
    # e.g. "Please wait 19 seconds before retrying."
    m = re.search(r"wait\s+(\d+)\s+seconds?", msg, re.IGNORECASE)
    if m:
        try:
            return max(1, min(60, int(m.group(1))))
        except Exception:
            pass
    return 20


async def _event_stream(*, user: User, session_id: int, payload: ChatSessionStreamRequest) -> AsyncIterator[bytes]:
    started = time.time()
    with Session(engine) as db:
        # resolve active model profile (fallback to env default)
        active = db.exec(select(ActiveModelProfile).where(ActiveModelProfile.owner_user_id == user.id)).first()
        profile: ModelProfile | None = None
        if active:
            profile = db.exec(
                select(ModelProfile).where(ModelProfile.id == active.model_profile_id, ModelProfile.owner_user_id == user.id)
            ).first()
        if profile:
            if not allow_request(key=f"user:{user.id}:model:{profile.id}", rpm_limit=profile.rpm_limit):
                yield _sse(ChatSseEvent(type="error", data={"message": f"Rate limit exceeded ({profile.rpm_limit} rpm)."}))
                return
            resolved_key = merged_openai_api_key(db) if (profile.api_key or "").strip().lower() == "runtime" else profile.api_key
            provider = get_provider_from_profile(
                {
                    "provider": profile.provider,
                    "base_url": profile.base_url,
                    "api_key": resolved_key,
                    "model": profile.model,
                }
            )
        else:
            provider = get_provider()
        meta = provider.meta()
        yield _sse(ChatSseEvent(type="meta", data={"provider": meta.name, "model": meta.model}))

        s = db.exec(select(ChatSession).where(ChatSession.id == session_id)).first()
        if not s or s.owner_user_id != user.id:
            yield _sse(ChatSseEvent(type="error", data={"message": "Session not found"}))
            return

        user_row = ChatMessageRow(session_id=session_id, role="user", content=payload.user_message, created_at=now_ms())
        db.add(user_row)

        # Update title on first real message
        if (s.title or "").strip().lower() in ("new chat", "new", ""):
            s.title = _derive_title(payload.user_message)
        s.updated_at = now_ms()
        db.add(s)
        db.commit()

        rows = db.exec(
            select(ChatMessageRow).where(ChatMessageRow.session_id == session_id).order_by(ChatMessageRow.created_at.asc())
        ).all()
        base_messages = [
            ChatMessage(role=r.role, content=r.content)
            for r in rows
            if r.role in ("system", "user", "assistant", "tool")
        ]

        # Inject RAG context as system message if session bound to a knowledge base.
        if s.kb_id:
            hits = retrieve_chunks(db, kb_id=s.kb_id, query=payload.user_message, top_k=5)
            ctx = build_context_block(hits)
            if ctx:
                base_messages = [ChatMessage(role="system", content=ctx)] + base_messages

        # Tool-calling loop (non-stream) to execute functions, then final stream.
        tools = openai_tools_payload()
        tool_rounds = 0
        assistant_acc = ""
        skip_stream = False

        def _persist_assistant_error(message: str) -> None:
            text = (message or "").strip() or "模型调用失败"
            db.add(ChatMessageRow(session_id=session_id, role="assistant", content=f"Error: {text}", created_at=now_ms()))
            s.updated_at = now_ms()
            db.add(s)
            db.commit()

        rate_limited_retry_used = False
        while tool_rounds < 3:
            tool_rounds += 1
            req = ChatRequest(
                messages=base_messages,
                temperature=payload.temperature,
                top_p=payload.top_p,
                max_output_tokens=payload.max_output_tokens,
            )
            try:
                resp = await provider.chat(req, tools=tools)
            except ProviderError as e:
                # Some Ollama models do not implement tool calls.
                # Gracefully downgrade to plain streaming chat.
                if _is_tools_unsupported_error(e):
                    break
                if _is_rate_limit_error(e) and not rate_limited_retry_used:
                    wait_s = _extract_retry_after_seconds(e)
                    rate_limited_retry_used = True
                    yield _sse(ChatSseEvent(type="meta", data={"status": "rate_limited", "retry_in_s": wait_s}))
                    await asyncio.sleep(wait_s)
                    continue
                _persist_assistant_error(str(e))
                yield _sse(ChatSseEvent(type="error", data={"message": str(e)}))
                return
            choice = (resp.get("choices") or [{}])[0]
            msg = choice.get("message") or {}
            tool_calls = msg.get("tool_calls") or []
            content = (msg.get("content") or "").strip()

            # If model returned normal content without tool calls, just stream that content by
            # seeding it into assistant_acc and skipping to persistence.
            if not tool_calls:
                assistant_seed = content
                if assistant_seed:
                    assistant_acc = assistant_seed
                    yield _sse(ChatSseEvent(type="delta", data={"text": assistant_seed}))
                    skip_stream = True
                else:
                    # Some models return empty content in this non-stream tools round.
                    # Fall through to normal streaming so the UI still receives an answer.
                    skip_stream = False
                break

            # Persist tool-call marker (best-effort) as assistant message.
            if content:
                db.add(ChatMessageRow(session_id=session_id, role="assistant", content=content, created_at=now_ms()))
                db.commit()
                base_messages.append(ChatMessage(role="assistant", content=content))

            # Execute tools in order.
            for tc in tool_calls:
                fn = (tc.get("function") or {})
                tool_name = str(fn.get("name") or "")
                arg_str = str(fn.get("arguments") or "{}")
                try:
                    args = json.loads(arg_str) if isinstance(arg_str, str) else (arg_str or {})
                except Exception:
                    args = {}

                yield _sse(ChatSseEvent(type="meta", data={"tool": tool_name, "status": "running"}))
                try:
                    result = await run_tool(tool_name, args if isinstance(args, dict) else {})
                    out_text = format_tool_result(tool_name, result)
                except ToolError as e:
                    out_text = format_tool_result(tool_name, {"error": str(e)})

                # Save tool output and add to conversation.
                db.add(ChatMessageRow(session_id=session_id, role="tool", content=out_text, created_at=now_ms()))
                db.commit()
                base_messages.append(ChatMessage(role="tool", content=out_text))

            # continue loop to let model use tool outputs

        try:
            if not skip_stream:
                final_req = ChatRequest(
                    messages=base_messages,
                    temperature=payload.temperature,
                    top_p=payload.top_p,
                    max_output_tokens=payload.max_output_tokens,
                )
                try:
                    async for tok in provider.stream_chat(final_req):
                        assistant_acc += tok
                        yield _sse(ChatSseEvent(type="delta", data={"text": tok}))
                except ProviderError as e:
                    if _is_rate_limit_error(e) and not rate_limited_retry_used:
                        wait_s = _extract_retry_after_seconds(e)
                        rate_limited_retry_used = True
                        yield _sse(ChatSseEvent(type="meta", data={"status": "rate_limited", "retry_in_s": wait_s}))
                        await asyncio.sleep(wait_s)
                        async for tok in provider.stream_chat(final_req):
                            assistant_acc += tok
                            yield _sse(ChatSseEvent(type="delta", data={"text": tok}))
                    else:
                        raise
            elapsed_ms = int((time.time() - started) * 1000)

            db.add(ChatMessageRow(session_id=session_id, role="assistant", content=assistant_acc, created_at=now_ms()))
            s.updated_at = now_ms()
            db.add(s)
            db.commit()
            write_audit(db, actor=user, action="chat.message", resource=f"chat_session:{session_id}", meta={"elapsed_ms": elapsed_ms})
            yield _sse(ChatSseEvent(type="done", data={"elapsed_ms": elapsed_ms}))
        except ProviderError as e:
            _persist_assistant_error(str(e))
            yield _sse(ChatSseEvent(type="error", data={"message": str(e)}))
        except Exception:
            _persist_assistant_error("Unexpected server error")
            yield _sse(ChatSseEvent(type="error", data={"message": "Unexpected server error"}))


@router.post("/{session_id}/stream")
async def stream_to_session(
    session_id: int,
    request: Request,
    user: User = Depends(get_current_user),
):
    ctype = (request.headers.get("content-type") or "").lower()
    if "multipart/form-data" in ctype:
        form = await request.form()
        user_message = str(form.get("user_message") or "").strip()
        if not user_message:
            raise HTTPException(status_code=400, detail="user_message is required")

        # Optional generation params (best-effort).
        def _opt_float(name: str) -> float | None:
            v = form.get(name)
            if v is None:
                return None
            try:
                return float(str(v))
            except Exception:
                return None

        def _opt_int(name: str) -> int | None:
            v = form.get(name)
            if v is None:
                return None
            try:
                return int(str(v))
            except Exception:
                return None

        files = form.getlist("files")
        file_names = []
        for f in files:
            fn = getattr(f, "filename", None)
            if fn:
                file_names.append(str(fn))
        if file_names:
            user_message = f"{user_message}\n\n[附件] {', '.join(file_names)}"

        payload = ChatSessionStreamRequest(
            user_message=user_message,
            temperature=_opt_float("temperature"),
            top_p=_opt_float("top_p"),
            max_output_tokens=_opt_int("max_output_tokens"),
        )
    else:
        data = await request.json()
        payload = ChatSessionStreamRequest(**(data or {}))

    return StreamingResponse(_event_stream(user=user, session_id=session_id, payload=payload), media_type="text/event-stream")

