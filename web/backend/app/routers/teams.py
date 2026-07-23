from __future__ import annotations

import re

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from ..audit import write_audit
from ..auth import get_current_user, require_admin
from ..db import get_session
from ..models import Team, TeamMember, User, now_ms


router = APIRouter(prefix="/api/teams", tags=["teams"])


def _slugify(name: str) -> str:
    s = name.strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    s = re.sub(r"-+", "-", s).strip("-")
    return s or "team"


class TeamCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    slug: str | None = Field(default=None, min_length=2, max_length=80)


class TeamOut(BaseModel):
    id: int
    name: str
    slug: str
    created_at: int
    updated_at: int


@router.get("", response_model=list[TeamOut])
def list_my_teams(
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[TeamOut]:
    rows = session.exec(
        select(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .where(TeamMember.user_id == user.id)
        .order_by(Team.updated_at.desc())
    ).all()
    return [TeamOut.model_validate(t.model_dump()) for t in rows]  # type: ignore[arg-type]


@router.post("", response_model=TeamOut)
def create_team(
    payload: TeamCreate,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> TeamOut:
    slug = (payload.slug or _slugify(payload.name)).strip().lower()
    if session.exec(select(Team).where(Team.slug == slug)).first():
        raise HTTPException(status_code=409, detail="Team slug already exists")
    team = Team(name=payload.name.strip(), slug=slug, created_at=now_ms(), updated_at=now_ms())
    session.add(team)
    session.commit()
    session.refresh(team)

    member = TeamMember(team_id=team.id, user_id=user.id, role="owner")
    session.add(member)
    session.commit()

    write_audit(session, actor=user, action="team.create", resource=f"team:{team.id}", meta={"slug": slug})
    return TeamOut.model_validate(team.model_dump())  # type: ignore[arg-type]


class MemberOut(BaseModel):
    id: int
    team_id: int
    user_id: int
    user_email: str
    user_name: str
    role: str
    created_at: int


@router.get("/{team_id}/members", response_model=list[MemberOut])
def list_members(
    team_id: int,
    user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> list[MemberOut]:
    m = session.exec(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)
    ).first()
    if not m and user.role != "admin":
        raise HTTPException(status_code=403, detail="Not a team member")
    rows = session.exec(
        select(TeamMember, User)
        .join(User, User.id == TeamMember.user_id)
        .where(TeamMember.team_id == team_id)
        .order_by(TeamMember.created_at.asc())
    ).all()
    out: list[MemberOut] = []
    for member, u in rows:
        out.append(
            MemberOut(
                id=member.id,  # type: ignore[arg-type]
                team_id=member.team_id,
                user_id=member.user_id,
                user_email=u.email,
                user_name=u.name,
                role=member.role,
                created_at=member.created_at,
            )
        )
    return out


class MemberAdd(BaseModel):
    user_email: str = Field(min_length=3, max_length=255)
    role: str = Field(default="member")  # owner/admin/member


@router.post("/{team_id}/members", response_model=MemberOut)
def add_member(
    team_id: int,
    payload: MemberAdd,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MemberOut:
    actor_member = session.exec(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == actor.id)
    ).first()
    if actor.role != "admin" and (not actor_member or actor_member.role not in ("owner", "admin")):
        raise HTTPException(status_code=403, detail="Team admin required")

    user = session.exec(select(User).where(User.email == payload.user_email)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if session.exec(select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == user.id)).first():
        raise HTTPException(status_code=409, detail="Already a member")

    role = payload.role if payload.role in ("owner", "admin", "member") else "member"
    member = TeamMember(team_id=team_id, user_id=user.id, role=role)
    session.add(member)
    session.commit()
    session.refresh(member)

    write_audit(
        session,
        actor=actor,
        action="team.member.add",
        resource=f"team:{team_id}",
        meta={"user_id": user.id, "role": role},
    )
    return MemberOut(
        id=member.id,  # type: ignore[arg-type]
        team_id=member.team_id,
        user_id=member.user_id,
        user_email=user.email,
        user_name=user.name,
        role=member.role,
        created_at=member.created_at,
    )


class MemberRoleUpdate(BaseModel):
    role: str = Field(..., pattern="^(owner|admin|member)$")


@router.put("/{team_id}/members/{member_id}", response_model=MemberOut)
def update_member_role(
    team_id: int,
    member_id: int,
    payload: MemberRoleUpdate,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> MemberOut:
    actor_member = session.exec(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == actor.id)
    ).first()
    if actor.role != "admin" and (not actor_member or actor_member.role not in ("owner", "admin")):
        raise HTTPException(status_code=403, detail="Team admin required")

    member = session.exec(select(TeamMember).where(TeamMember.id == member_id, TeamMember.team_id == team_id)).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    member.role = payload.role
    session.add(member)
    session.commit()
    session.refresh(member)
    write_audit(
        session,
        actor=actor,
        action="team.member.role",
        resource=f"team:{team_id}",
        meta={"member_id": member_id, "role": payload.role},
    )
    u = session.exec(select(User).where(User.id == member.user_id)).first()
    return MemberOut(
        id=member.id,  # type: ignore[arg-type]
        team_id=member.team_id,
        user_id=member.user_id,
        user_email=(u.email if u else ""),
        user_name=(u.name if u else ""),
        role=member.role,
        created_at=member.created_at,
    )


@router.delete("/{team_id}/members/{member_id}")
def remove_member(
    team_id: int,
    member_id: int,
    actor: User = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    actor_member = session.exec(
        select(TeamMember).where(TeamMember.team_id == team_id, TeamMember.user_id == actor.id)
    ).first()
    if actor.role != "admin" and (not actor_member or actor_member.role not in ("owner", "admin")):
        raise HTTPException(status_code=403, detail="Team admin required")

    member = session.exec(select(TeamMember).where(TeamMember.id == member_id, TeamMember.team_id == team_id)).first()
    if not member:
        raise HTTPException(status_code=404, detail="Member not found")
    session.delete(member)
    session.commit()
    write_audit(
        session,
        actor=actor,
        action="team.member.remove",
        resource=f"team:{team_id}",
        meta={"member_id": member_id},
    )
    return {"ok": True}


@router.get("/admin/all", response_model=list[TeamOut])
def admin_list_all_teams(
    _: User = Depends(require_admin),
    session: Session = Depends(get_session),
) -> list[TeamOut]:
    teams = session.exec(select(Team).order_by(Team.created_at.desc())).all()
    return [TeamOut.model_validate(t.model_dump()) for t in teams]  # type: ignore[arg-type]

