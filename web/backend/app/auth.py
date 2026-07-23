from __future__ import annotations

import os
import time
import base64
import hashlib
import hmac
import secrets
from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlmodel import Session, select

from .config import settings
from .db import get_session
from .models import User, now_ms


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

JWT_SECRET = (os.getenv("JWT_SECRET") or "").strip() or "dev-secret-change-me"
JWT_ALG = "HS256"
JWT_TTL_SECONDS = int((os.getenv("JWT_TTL_SECONDS") or "86400").strip() or "86400")


PBKDF2_ITERATIONS = 260000
PBKDF2_ALGO = "sha256"


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac(PBKDF2_ALGO, (password or "").encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return "pbkdf2${}${}${}".format(
        PBKDF2_ITERATIONS,
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(dk).decode("ascii"),
    )


def verify_password(password: str, password_hash: str) -> bool:
    try:
        if not password_hash or not password_hash.startswith("pbkdf2$"):
            return False
        parts = password_hash.split("$")
        if len(parts) != 4:
            return False
        iterations = int(parts[1])
        salt = base64.urlsafe_b64decode(parts[2].encode("ascii"))
        expected = base64.urlsafe_b64decode(parts[3].encode("ascii"))
        got = hashlib.pbkdf2_hmac(PBKDF2_ALGO, (password or "").encode("utf-8"), salt, iterations)
        return hmac.compare_digest(got, expected)
    except Exception:
        return False


def create_access_token(*, sub: str, role: str) -> str:
    now = int(time.time())
    payload = {
        "sub": sub,
        "role": role,
        "iat": now,
        "exp": now + JWT_TTL_SECONDS,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    role: str


def decode_token(token: str) -> TokenClaims:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        sub = str(payload.get("sub", ""))
        role = str(payload.get("role", "user"))
        if not sub:
            raise JWTError("missing sub")
        return TokenClaims(sub=sub, role=role)
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def get_current_user(
    token: str | None = Depends(oauth2_scheme),
    session: Session = Depends(get_session),
) -> User:
    if settings.auth_disabled:
        email = "admin@local"
        user = session.exec(select(User).where(User.email == email)).first()
        if user:
            return user
        # Create a local admin automatically when auth is disabled.
        user = User(
            email=email,
            name="Local Admin",
            password_hash=hash_password("admin123456"),
            role="admin",
            is_active=True,
            created_at=now_ms(),
            updated_at=now_ms(),
        )
        session.add(user)
        session.commit()
        session.refresh(user)
        return user

    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")
    claims = decode_token(token)
    stmt = select(User).where(User.email == claims.sub)
    user = session.exec(stmt).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Inactive user")
    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin required")
    return user

