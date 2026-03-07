import csv
import io
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import Ticket, TicketStatus, UserClient
from schemas import TicketCreate, TicketRead, TicketStatusUpdate, TicketUploadResult, TicketUploadRowError

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
        # No user_clients table or no row: allow default and user_id as client_id
        if client_id == user_id or str(client_id) == settings.default_client_id:
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


def _norm(s: str | None) -> str | None:
    if s is None:
        return None
    t = s.strip()
    return t if t else None


def _row_to_payload(row: dict[str, str]) -> tuple[dict | None, str | None]:
    """Build a dict suitable for TicketCreate from a CSV row. Returns (payload, error_message)."""
    # Normalize keys to lower for lookup
    raw = {k.strip().lower(): v for k, v in row.items() if k}
    short_desc = _norm(raw.get("short_desc"))
    if not short_desc:
        return None, "short_desc is required"
    full_desc = _norm(raw.get("full_desc"))
    external_id = _norm(raw.get("external_id"))
    source_system = _norm(raw.get("source_system"))
    resolution = _norm(raw.get("resolution"))
    root_cause = _norm(raw.get("root_cause"))
    priority = _norm(raw.get("priority"))
    status_raw = _norm(raw.get("status"))
    status = None
    if status_raw:
        u = status_raw.upper()
        if u in ("OPEN", "CLOSED"):
            status = TicketStatus.OPEN if u == "OPEN" else TicketStatus.CLOSED
    is_resolved = status == TicketStatus.CLOSED if status is not None else False
    payload = {
        "short_desc": short_desc,
        "full_desc": full_desc,
        "external_id": external_id,
        "source_system": source_system,
        "resolution": resolution,
        "root_cause": root_cause,
        "priority": priority,
        "status": status,
        "is_resolved": is_resolved,
    }
    return payload, None


@router.post("/tickets/upload", response_model=TicketUploadResult, status_code=201)
async def upload_tickets_csv(
    file: UploadFile = File(..., description="CSV file with ticket rows"),
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    """Parse CSV in memory, validate each row with TicketCreate, insert valid rows. Does not store the CSV."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV (filename ending in .csv)")
    content = await file.read()
    try:
        text = content.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"File could not be decoded as UTF-8: {e}"
        ) from e
    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV has no header row")
    errors: list[TicketUploadRowError] = []
    tickets_to_add: list[Ticket] = []
    for row_index, row in enumerate(reader, start=2):
        payload, row_error = _row_to_payload(row)
        if row_error:
            errors.append(TicketUploadRowError(row=row_index, message=row_error))
            continue
        try:
            body = TicketCreate(**payload)
        except ValidationError as e:
            err_msg = e.errors()[0].get("msg", str(e)) if e.errors() else str(e)
            errors.append(TicketUploadRowError(row=row_index, message=err_msg))
            continue
        tickets_to_add.append(Ticket(client_id=client_id, **body.model_dump()))
    if not tickets_to_add:
        result = TicketUploadResult(created=0, errors=errors)
        return JSONResponse(content=result.model_dump(), status_code=422)
    db.add_all(tickets_to_add)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk insert failed: {exc}") from exc
    return TicketUploadResult(created=len(tickets_to_add), errors=errors)


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


@router.patch("/tickets/{ticket_id}/status", response_model=TicketRead)
async def update_ticket_status(
    ticket_id: uuid.UUID,
    body: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    result = await db.execute(
        select(Ticket).where(Ticket.ticket_id == ticket_id, Ticket.client_id == client_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")
    ticket.status = body.status
    ticket.is_resolved = body.is_resolved
    await db.commit()
    await db.refresh(ticket)
    return ticket
