import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.sql import func

from config import settings
from db import get_db
from models import Client, UserClient
from schemas import ClientCreate, ClientRead

router = APIRouter(tags=["clients"])


def _user_id(request: Request) -> uuid.UUID:
    user = getattr(request.state, "user", {})
    raw = user.get("sub", settings.default_client_id)
    return uuid.UUID(str(raw))


@router.get("/clients", response_model=list[ClientRead])
async def list_clients_for_user(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Return clients the current user has access to."""
    user_id = _user_id(request)
    default_id = uuid.UUID(settings.default_client_id)
    try:
        result = await db.execute(
            select(Client)
            .join(UserClient, UserClient.client_id == Client.client_id)
            .where(UserClient.user_id == user_id)
        )
        clients = result.scalars().all()
        if not clients:
            r = await db.execute(select(Client).where(Client.client_id == default_id))
            default_client = r.scalar_one_or_none()
            if default_client:
                return [default_client]
            return [ClientRead(client_id=default_id, name="Default")]
        return clients
    except Exception:
        # Tables may not exist yet: return synthetic default so frontend can still work
        return [ClientRead(client_id=default_id, name="Default")]


@router.post("/clients", response_model=ClientRead, status_code=status.HTTP_201_CREATED)
async def create_client(
    body: ClientCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create a client and automatically grant the current user access to it."""
    user_id = _user_id(request)
    try:
        # Case-insensitive duplicate name check among clients this user has access to
        existing = await db.execute(
            select(Client)
            .join(UserClient, UserClient.client_id == Client.client_id)
            .where(UserClient.user_id == user_id)
            .where(func.lower(Client.name) == body.name.strip().lower())
        )
        if existing.scalar_one_or_none():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A client with this name already exists.",
            )

        client = Client(name=body.name)
        db.add(client)
        await db.flush()  # ensure client_id is available

        db.add(UserClient(user_id=user_id, client_id=client.client_id))
        await db.commit()
        await db.refresh(client)
        return client
    except HTTPException:
        await db.rollback()
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create client (did you run the SQL migrations?): {exc}",
        )


@router.post("/clients/{client_id}/join", status_code=status.HTTP_204_NO_CONTENT)
async def join_client(
    client_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Grant the current user access to an existing client."""
    user_id = _user_id(request)
    try:
        result = await db.execute(select(Client).where(Client.client_id == client_id))
        client = result.scalar_one_or_none()
        if not client:
            raise HTTPException(status_code=404, detail="Client not found")

        # Idempotent-ish: if already joined, nothing changes (but primary key prevents duplicates)
        db.add(UserClient(user_id=user_id, client_id=client_id))
        await db.commit()
        return
    except HTTPException:
        raise
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to join client: {exc}")
