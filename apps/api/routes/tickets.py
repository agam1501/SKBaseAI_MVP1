import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import Ticket
from schemas import TicketCreate, TicketRead

router = APIRouter(tags=["tickets"])


def _client_id(request: Request) -> uuid.UUID:
    """Extract client_id from JWT sub or fall back to DEFAULT_CLIENT_ID."""
    user = getattr(request.state, "user", {})
    raw = user.get("sub", settings.default_client_id)
    return uuid.UUID(str(raw))


@router.post("/tickets", response_model=TicketRead, status_code=201)
async def create_ticket(
    body: TicketCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_id = _client_id(request)
    ticket = Ticket(client_id=client_id, **body.model_dump())
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)
    return ticket


@router.get("/tickets", response_model=list[TicketRead])
async def list_tickets(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_id = _client_id(request)
    result = await db.execute(
        select(Ticket).where(Ticket.client_id == client_id).order_by(Ticket.created_at.desc())
    )
    return result.scalars().all()


@router.get("/tickets/{ticket_id}", response_model=TicketRead)
async def get_ticket(
    ticket_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    client_id = _client_id(request)
    result = await db.execute(
        select(Ticket).where(Ticket.ticket_id == ticket_id, Ticket.client_id == client_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return ticket
