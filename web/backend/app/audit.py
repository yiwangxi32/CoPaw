from __future__ import annotations

import json
from typing import Any

from sqlmodel import Session

from .models import AuditLog, User, now_ms


def write_audit(
    session: Session,
    *,
    actor: User | None,
    action: str,
    resource: str = "",
    meta: dict[str, Any] | None = None,
) -> None:
    log = AuditLog(
        actor_user_id=actor.id if actor else None,
        action=action,
        resource=resource,
        meta_json=json.dumps(meta or {}, ensure_ascii=False),
        created_at=now_ms(),
    )
    session.add(log)
    session.commit()

