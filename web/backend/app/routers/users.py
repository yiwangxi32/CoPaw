from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user, require_admin
from ..db import get_session
from ..models import User, now_ms


router = APIRouter(prefix="/api/users", tags=["users"])


class UserMe(BaseModel):
    email: str
    name: str
    role: str
    is_active: bool


@router.get("/me", response_model=UserMe)
def me(user: User = Depends(get_current_user)) -> UserMe:
    return UserMe(email=user.email, name=user.name, role=user.role, is_active=user.is_active)


class UserOut(BaseModel):
    id: int
    email: str
    name: str
    role: str
    is_active: bool
    created_at: int
    updated_at: int


@router.get("", response_model=list[UserOut])
def list_users(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[UserOut]:
    users = session.exec(select(User).order_by(User.created_at.desc())).all()
    return [UserOut.model_validate(u.model_dump()) for u in users]  # type: ignore[arg-type]


class UserUpdate(BaseModel):
    name: str | None = None
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    is_active: bool | None = None


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    payload: UserUpdate,
    actor: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> UserOut:
    user = session.exec(select(User).where(User.id == user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if payload.name is not None:
        user.name = payload.name
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    user.updated_at = now_ms()
    session.add(user)
    session.commit()
    session.refresh(user)
    write_audit(
        session,
        actor=actor,
        action="user.update",
        resource=f"user:{user_id}",
        meta={"role": user.role, "is_active": user.is_active},
    )
    return UserOut.model_validate(user.model_dump())  # type: ignore[arg-type]

