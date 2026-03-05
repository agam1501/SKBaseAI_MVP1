import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import Ticket, UserClient
from schemas import TicketCreate, TicketRead

router = APIRouter(tags=["tickets"])


def _user_id(request: Request) -> uuid.UUID:
    user = getattr(request.state, "user", {})
    raw = user.get("sub", settings.default_client_id)
    return uuid.UUID(str(raw))


async def get_effective_client_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID:
    """Use X-Client-Id header if present and user has access; else JWT sub."""
    header = request.headers.get("X-Client-Id")
    user_id = _user_id(request)
    if header:
        try:
            client_id = uuid.UUID(header)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid X-Client-Id")
        # Check user has access: user_clients row or fallback (no rows = allow default + user's own)
        result = await db.execute(
            select(UserClient).where(
                UserClient.user_id == user_id,
                UserClient.client_id == client_id,
            )
        )
        if result.scalar_one_or_none() is not None:
            return client_id
        # Fallback when UserClient not populated: allow only the default client
        if str(client_id) == settings.default_client_id:
            return client_id
        raise HTTPException(status_code=403, detail="Access to this client not allowed")
    return user_id


@router.post("/tickets", response_model=TicketRead, status_code=201)
async def create_ticket(
    body: TicketCreate,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    ticket = Ticket(client_id=client_id, **body.model_dump())
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/tickets", response_model=list[TicketRead])
async def list_tickets(
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    result = await db.execute(
        select(Ticket).where(Ticket.client_id == client_id).order_by(Ticket.created_at.desc())
    )
    return result.scalars().all()


@router.get("/tickets/{ticket_id}", response_model=TicketRead)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    result = await db.execute(
        select(Ticket).where(Ticket.ticket_id == ticket_id, Ticket.client_id == client_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket
