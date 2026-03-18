import logging
import uuid

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import UserClient, UserInvitation, UserRole, UserRoles
from routes.clients import _user_id
from routes.tickets import get_effective_client_id
from schemas import UserInvite, UserRead
from services import supabase_admin

logger = logging.getLogger(__name__)
router = APIRouter(tags=["users"])


async def _require_admin_or_developer(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    user_id = _user_id(request)
    result = await db.execute(select(UserRoles).where(UserRoles.user_id == user_id))
    ur = result.scalar_one_or_none()
    if not ur or ur.role not in (UserRole.admin, UserRole.developer):
        raise HTTPException(status_code=403, detail="Requires Admin or Developer role")
    return user_id


@router.get("/users", response_model=list[UserRead])
async def list_users(
    request: Request,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
    me: uuid.UUID = Depends(_require_admin_or_developer),
):
    """List users invited by the current admin for the selected client."""
    result = await db.execute(
        select(UserInvitation).where(
            UserInvitation.invited_by_user_id == me,
            UserInvitation.client_id == client_id,
        )
    )
    invitations = result.scalars().all()

    if not invitations:
        return []

    # Fetch auth user details for invited user IDs
    auth_users = await supabase_admin.list_auth_users()
    auth_by_id: dict[str, dict] = {u["id"]: u for u in auth_users}

    users: list[UserRead] = []
    for inv in invitations:
        auth_user = auth_by_id.get(str(inv.invited_user_id))
        if not auth_user:
            continue
        users.append(
            UserRead(
                user_id=inv.invited_user_id,
                email=auth_user.get("email", ""),
                role=inv.role,
                invited_at=inv.created_at,
            )
        )
    return users


@router.post("/users/invite", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def invite_user(
    body: UserInvite,
    request: Request,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
    me: uuid.UUID = Depends(_require_admin_or_developer),
):
    """Invite a new user by email, assign role, and record the invitation."""
    # Enforce role assignment permissions
    caller_result = await db.execute(select(UserRoles).where(UserRoles.user_id == me))
    caller_role = caller_result.scalar_one_or_none()
    allowed: dict[UserRole, set[UserRole]] = {
        UserRole.admin: {UserRole.responder},
        UserRole.developer: {UserRole.admin, UserRole.responder},
    }
    if caller_role is None or body.role not in allowed.get(caller_role.role, set()):
        raise HTTPException(
            status_code=403, detail=f"Your role cannot invite {body.role.value} users"
        )

    redirect_to = f"{settings.site_url}/auth/callback"
    logger.info("[invite] redirect_to=%s", redirect_to)
    try:
        auth_user = await supabase_admin.invite_user_by_email(body.email, redirect_to)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code,
            detail=f"Supabase invite failed: {exc.response.text}",
        )

    invited_user_id = uuid.UUID(auth_user["id"])

    try:
        # Idempotent: add role if not already assigned
        existing_role = await db.execute(
            select(UserRoles).where(UserRoles.user_id == invited_user_id)
        )
        if not existing_role.scalar_one_or_none():
            db.add(UserRoles(user_id=invited_user_id, role=body.role))

        # Idempotent: grant client access if not already granted
        existing_uc = await db.execute(
            select(UserClient).where(
                UserClient.user_id == invited_user_id,
                UserClient.client_id == client_id,
            )
        )
        if not existing_uc.scalar_one_or_none():
            db.add(UserClient(user_id=invited_user_id, client_id=client_id))

        invitation = UserInvitation(
            invited_user_id=invited_user_id,
            invited_by_user_id=me,
            client_id=client_id,
            role=body.role,
        )
        db.add(invitation)
        await db.commit()
        await db.refresh(invitation)
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to record invitation: {exc}")

    return UserRead(
        user_id=invited_user_id,
        email=body.email,
        role=body.role,
        invited_at=invitation.created_at,
    )
