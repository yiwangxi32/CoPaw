from __future__ import annotations

from fastapi import Depends, HTTPException
from sqlmodel import Session, select

from .auth import get_current_user
from .db import get_session
from .models import TeamMember, User


def require_team_role(*, team_id: int, any_of: set[str]):
    def _dep(
        user: User = Depends(get_current_user),
        session: Session = Depends(get_session),
    ) -> User:
        m = session.exec(
            select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
        ).first()
        if not m or m.role not in any_of:
            raise HTTPException(status_code=403, detail="Insufficient team role")
        return user

    return _dep


def is_team_adminish(role: str) -> bool:
    return role in ("owner", "admin")

