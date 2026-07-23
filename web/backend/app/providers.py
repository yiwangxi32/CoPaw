from __future__ import annotations

import asyncio
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass

import httpx

from sqlmodel import Session

from .config import settings
from .db import engine
from .runtime_kv import merged_openai_api_key, merged_openai_base_url, merged_openai_model
from .schemas import ChatRequest


@dataclass(frozen=True)
class ProviderMeta:
    name: str
    model: str


class ProviderError(RuntimeError):
    pass


class BaseChatProvider:
    def meta(self) -> ProviderMeta:  # pragma: no cover
        raise NotImplementedError

    async def stream_chat(self, req: ChatRequest) -> AsyncIterator[str]:  # pragma: no cover
        raise NotImplementedError

    async def chat(self, req: ChatRequest, *, tools: list[dict] | None = None) -> dict:  # pragma: no cover
        raise NotImplementedError


class OpenAICompatProvider(BaseChatProvider):
    """
    Talks to any OpenAI-compatible Chat Completions endpoint.
    It streams tokens by parsing server-sent events lines that start with "data:".
    """

    def __init__(self, *, base_url: str, api_key: str, model: str) -> None:
        self._base_url = (base_url or "").rstrip("/") or "https://api.openai.com/v1"
        self._api_key = api_key or ""
        self._model = model or "gpt-4.1-mini"

    def meta(self) -> ProviderMeta:
        return ProviderMeta(name="openai_compat", model=self._model)

    async def stream_chat(self, req: ChatRequest) -> AsyncIterator[str]:
        if not self._api_key:
            raise ProviderError("OPENAI_API_KEY is missing. Set it in backend/.env.")

        url = f"{self._base_url}/chat/completions"
        payload: dict = {
            "model": self._model,
            "messages": [m.model_dump() for m in req.messages],
            "stream": True,
        }
        if req.temperature is not None:
            payload["temperature"] = req.temperature
        if req.top_p is not None:
            payload["top_p"] = req.top_p
        if req.max_output_tokens is not None:
            payload["max_tokens"] = req.max_output_tokens

        headers = {
            "Authorization": f"Bearer {self._api_key}",
            "Content-Type": "application/json",
        }

        timeout = httpx.Timeout(connect=15.0, read=300.0, write=60.0, pool=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            async with client.stream("POST", url, headers=headers, json=payload) as r:
                if r.status_code >= 400:
                    text = await r.aread()
                    raise ProviderError(f"Provider error {r.status_code}: {text[:400].decode(errors='ignore')}")

                async for line in r.aiter_lines():
                    if not line:
                        continue
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if data == "[DONE]":
                        return
                    try:
                        obj = json.loads(data)
                        delta = (
                            obj.get("choices", [{}])[0]
                            .get("delta", {})
                            .get("content")
                        )
                        if delta:
                            yield str(delta)
                    except json.JSONDecodeError:
                        continue

    async def chat(self, req: ChatRequest, *, tools: list[dict] | None = None) -> dict:
        if not self._api_key:
            raise ProviderError("OPENAI_API_KEY is missing. Set it in backend/.env.")
        url = f"{self._base_url}/chat/completions"
        payload: dict = {
            "model": self._model,
            "messages": [m.model_dump() for m in req.messages],
            "stream": False,
        }
        if tools:
            payload["tools"] = tools
            payload["tool_choice"] = "auto"
        if req.temperature is not None:
            payload["temperature"] = req.temperature
        if req.top_p is not None:
            payload["top_p"] = req.top_p
        if req.max_output_tokens is not None:
            payload["max_tokens"] = req.max_output_tokens

        headers = {"Authorization": f"Bearer {self._api_key}", "Content-Type": "application/json"}
        timeout = httpx.Timeout(connect=15.0, read=120.0, write=60.0, pool=15.0)
        async with httpx.AsyncClient(timeout=timeout) as client:
            r = await client.post(url, headers=headers, json=payload)
            if r.status_code >= 400:
                raise ProviderError(f"Provider error {r.status_code}: {r.text[:400]}")
            return r.json()


def get_provider() -> BaseChatProvider:
    p = (settings.provider or "").strip().lower()
    if p in ("openai_compat", "openai", "compat"):
        with Session(engine) as session:
            base_url = merged_openai_base_url(session)
            api_key = merged_openai_api_key(session)
            model = merged_openai_model(session)
        return OpenAICompatProvider(
            base_url=base_url,
            api_key=api_key,
            model=model,
        )
    raise ProviderError(f"Unknown PROVIDER={settings.provider!r}")


def get_provider_from_profile(profile: dict) -> BaseChatProvider:
    """
    Profile is expected to include:
      - provider: str (currently only "openai_compat")
      - base_url: str
      - api_key: str
      - model: str
    """
    p = (profile.get("provider") or "openai_compat").strip().lower()
    if p in ("openai_compat", "openai", "compat"):
        return OpenAICompatProvider(
            base_url=str(profile.get("base_url") or ""),
            api_key=str(profile.get("api_key") or ""),
            model=str(profile.get("model") or ""),
        )
    raise ProviderError(f"Unknown provider={profile.get('provider')!r}")


async def fake_stream(text: str, delay_s: float = 0.01) -> AsyncIterator[str]:
    for ch in text:
        yield ch
        await asyncio.sleep(delay_s)

