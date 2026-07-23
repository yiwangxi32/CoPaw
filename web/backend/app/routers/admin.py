from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlmodel import Session, select

from ..auth import require_admin
from ..db import get_session
from ..models import AuditLog, User


router = APIRouter(prefix="/api/admin", tags=["admin"])


class AuditOut(BaseModel):
    id: int
    actor_user_id: int | None
    action: str
    resource: str
    meta: dict
    created_at: int


@router.get("/audit", response_model=list[AuditOut])
def list_audit(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
    limit: int = Query(default=200, ge=1, le=2000),
    actor_user_id: int | None = Query(default=None),
    action_prefix: str | None = Query(default=None),
) -> list[AuditOut]:
    stmt = select(AuditLog).order_by(AuditLog.created_at.desc()).limit(limit)
    if actor_user_id is not None:
        stmt = stmt.where(AuditLog.actor_user_id == actor_user_id)
    if action_prefix:
        stmt = stmt.where(AuditLog.action.startswith(action_prefix))  # type: ignore[attr-defined]
    rows = session.exec(stmt).all()
    out: list[AuditOut] = []
    for r in rows:
        try:
            meta = json.loads(r.meta_json or "{}")
        except Exception:
            meta = {}
        out.append(
            AuditOut(
                id=r.id,  # type: ignore[arg-type]
                actor_user_id=r.actor_user_id,
                action=r.action,
                resource=r.resource,
                meta=meta,
                created_at=r.created_at,
            )
        )
    return out

