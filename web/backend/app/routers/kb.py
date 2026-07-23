from __future__ import annotations

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user
from ..db import get_session
from ..models import KbChunk, KbDocument, KnowledgeBase, User, now_ms
from ..rag import build_context_block, chunk_text, extract_text_from_upload, retrieve_chunks


router = APIRouter(prefix="/api/kb", tags=["kb"])


class KbOut(BaseModel):
    id: int
    name: str
    created_at: int
    updated_at: int


class KbCreate(BaseModel):
    name: str = Field(min_length=2, max_length=120)


@router.get("", response_model=list[KbOut])
def list_kbs(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[KbOut]:
    rows = session.exec(
        select(KnowledgeBase)
        .where(KnowledgeBase.owner_user_id == user.id)
        .order_by(KnowledgeBase.updated_at.desc())
    ).all()
    return [KbOut(id=r.id, name=r.name, created_at=r.created_at, updated_at=r.updated_at) for r in rows]  # type: ignore[arg-type]


@router.post("", response_model=KbOut)
def create_kb(
    payload: KbCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> KbOut:
    kb = KnowledgeBase(owner_user_id=user.id, name=payload.name.strip(), created_at=now_ms(), updated_at=now_ms())
    session.add(kb)
    session.commit()
    session.refresh(kb)
    write_audit(session, actor=user, action="kb.create", resource=f"kb:{kb.id}")
    return KbOut(id=kb.id, name=kb.name, created_at=kb.created_at, updated_at=kb.updated_at)  # type: ignore[arg-type]


class KbDocOut(BaseModel):
    id: int
    filename: str
    mime_type: str
    size_bytes: int
    created_at: int
    chunk_count: int


@router.get("/{kb_id}/docs", response_model=list[KbDocOut])
def list_docs(
    kb_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[KbDocOut]:
    kb = session.exec(select(KnowledgeBase).where(KnowledgeBase.id == kb_id)).first()
    if not kb or kb.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    docs = session.exec(select(KbDocument).where(KbDocument.kb_id == kb_id).order_by(KbDocument.created_at.desc())).all()
    out: list[KbDocOut] = []
    for d in docs:
        cnt = len(session.exec(select(KbChunk).where(KbChunk.doc_id == d.id)).all())
        out.append(
            KbDocOut(
                id=d.id,  # type: ignore[arg-type]
                filename=d.filename,
                mime_type=d.mime_type,
                size_bytes=d.size_bytes,
                created_at=d.created_at,
                chunk_count=cnt,
            )
        )
    return out


@router.post("/{kb_id}/upload", response_model=KbDocOut)
async def upload_doc(
    kb_id: int,
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> KbDocOut:
    kb = session.exec(select(KnowledgeBase).where(KnowledgeBase.id == kb_id)).first()
    if not kb or kb.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")

    data = await file.read()
    text = extract_text_from_upload(file.filename or "document.txt", file.content_type or "", data)
    chunks = chunk_text(text)
    if not chunks:
        raise HTTPException(status_code=400, detail="No extractable text")

    doc = KbDocument(
        kb_id=kb_id,
        owner_user_id=user.id,
        filename=file.filename or "document.txt",
        mime_type=file.content_type or "",
        size_bytes=len(data),
        created_at=now_ms(),
    )
    session.add(doc)
    session.commit()
    session.refresh(doc)

    for i, c in enumerate(chunks):
        session.add(KbChunk(kb_id=kb_id, doc_id=doc.id, idx=i, text=c, created_at=now_ms()))  # type: ignore[arg-type]
    kb.updated_at = now_ms()
    session.add(kb)
    session.commit()
    write_audit(
        session,
        actor=user,
        action="kb.upload",
        resource=f"kb:{kb_id}",
        meta={"doc_id": doc.id, "filename": doc.filename, "chunks": len(chunks)},
    )
    return KbDocOut(
        id=doc.id,  # type: ignore[arg-type]
        filename=doc.filename,
        mime_type=doc.mime_type,
        size_bytes=doc.size_bytes,
        created_at=doc.created_at,
        chunk_count=len(chunks),
    )


class SearchReq(BaseModel):
    query: str = Field(min_length=1, max_length=2000)
    top_k: int = Field(default=5, ge=1, le=20)


@router.post("/{kb_id}/search")
def search_kb(
    kb_id: int,
    payload: SearchReq,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    kb = session.exec(select(KnowledgeBase).where(KnowledgeBase.id == kb_id)).first()
    if not kb or kb.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    hits = retrieve_chunks(session, kb_id=kb_id, query=payload.query, top_k=payload.top_k)
    return {
        "hits": [
            {"chunk_id": h.chunk_id, "doc_id": h.doc_id, "score": h.score, "text": h.text[:800]}
            for h in hits
        ]
    }


@router.get("/{kb_id}/context")
def rag_context(
    kb_id: int,
    q: str,
    top_k: int = 5,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    kb = session.exec(select(KnowledgeBase).where(KnowledgeBase.id == kb_id)).first()
    if not kb or kb.owner_user_id != user.id:
        raise HTTPException(status_code=404, detail="Knowledge base not found")
    hits = retrieve_chunks(session, kb_id=kb_id, query=q, top_k=top_k)
    return {"context": build_context_block(hits), "citations": [{"doc_id": h.doc_id, "chunk_id": h.chunk_id, "score": h.score} for h in hits]}

