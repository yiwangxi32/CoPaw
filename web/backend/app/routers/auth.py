from __future__ import annotations

import os

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..auth import create_access_token, hash_password, verify_password
from ..db import get_session
from ..models import User, now_ms


router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str = Field(min_length=1)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: str
    password: str = Field(min_length=8)
    name: str = ""


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)) -> AuthResponse:
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=401, detail="Inactive user")
    token = create_access_token(sub=user.email, role=user.role)
    return AuthResponse(access_token=token)


@router.post("/register")
def register(payload: RegisterRequest, session: Session = Depends(get_session)) -> dict:
    allow = (os.getenv("ALLOW_REGISTER") or "true").strip().lower() in ("1", "true", "yes", "y")
    if not allow:
        raise HTTPException(status_code=403, detail="Registration disabled")
    exists = session.exec(select(User).where(User.email == payload.email)).first()
    if exists:
        raise HTTPException(status_code=409, detail="Email already registered")
    user = User(
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        role="user",
        is_active=True,
        created_at=now_ms(),
        updated_at=now_ms(),
    )
    session.add(user)
    session.commit()
    return {"ok": True}

