from __future__ import annotations

import io
import re
from dataclasses import dataclass

from pypdf import PdfReader
from sqlmodel import Session, select

from .models import KbChunk


def extract_text_from_upload(filename: str, content_type: str, data: bytes) -> str:
    name = (filename or "").lower()
    ct = (content_type or "").lower()
    if name.endswith(".pdf") or "pdf" in ct:
        return _extract_pdf(data)
    return _extract_text_bytes(data)


def _extract_pdf(data: bytes) -> str:
    reader = PdfReader(io.BytesIO(data))
    parts: list[str] = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception:
            continue
    return "\n".join(parts)


def _extract_text_bytes(data: bytes) -> str:
    for enc in ("utf-8", "utf-16", "gbk", "latin-1"):
        try:
            return data.decode(enc)
        except Exception:
            continue
    return data.decode("utf-8", errors="ignore")


def clean_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def chunk_text(text: str, *, chunk_size: int = 900, overlap: int = 120) -> list[str]:
    text = clean_text(text)
    if not text:
        return []
    out: list[str] = []
    i = 0
    n = len(text)
    while i < n:
        j = min(n, i + chunk_size)
        chunk = text[i:j].strip()
        if chunk:
            out.append(chunk)
        if j >= n:
            break
        i = max(j - overlap, i + 1)
    return out


@dataclass
class RetrievalResult:
    chunk_id: int
    doc_id: int
    score: int
    text: str


def retrieve_chunks(session: Session, *, kb_id: int, query: str, top_k: int = 5) -> list[RetrievalResult]:
    q_terms = [t for t in re.split(r"\s+", query.lower().strip()) if t]
    if not q_terms:
        return []
    chunks = session.exec(select(KbChunk).where(KbChunk.kb_id == kb_id)).all()
    scored: list[RetrievalResult] = []
    for c in chunks:
        text_l = (c.text or "").lower()
        score = sum(text_l.count(t) for t in q_terms)
        if score > 0:
            scored.append(
                RetrievalResult(
                    chunk_id=c.id or 0,
                    doc_id=c.doc_id,
                    score=score,
                    text=c.text,
                )
            )
    scored.sort(key=lambda x: x.score, reverse=True)
    return scored[: max(1, min(20, top_k))]


def build_context_block(results: list[RetrievalResult]) -> str:
    if not results:
        return ""
    lines = ["[RAG CONTEXT START]"]
    for i, r in enumerate(results, start=1):
        lines.append(f"[citation:{i}] doc_id={r.doc_id} chunk_id={r.chunk_id}")
        lines.append(r.text[:1500])
        lines.append("")
    lines.append("[RAG CONTEXT END]")
    lines.append("When relevant, cite as [citation:N].")
    return "\n".join(lines).strip()

