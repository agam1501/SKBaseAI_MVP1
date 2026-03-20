import csv
import io
import logging
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, Query, Request, UploadFile
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from arq_pool import get_arq_pool
from config import settings
from db import get_db
from models import EnrichmentStatus, Ticket, TicketStatus, TicketTaxonomy, UserClient
from schemas import (
    TaxonomyRead,
    TicketCreate,
    TicketRead,
    TicketStatusUpdate,
    TicketUploadResult,
    TicketUploadRowError,
)

logger = logging.getLogger(__name__)

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
    ticket = Ticket(
        client_id=client_id,
        enrichment_status=EnrichmentStatus.PENDING,
        **body.model_dump(),
    )
    db.add(ticket)
    await db.commit()
    await db.refresh(ticket)

    # Enqueue background enrichment
    if settings.enable_enrichment:
        try:
            pool = await get_arq_pool()
            await pool.enqueue_job("run_enrich_ticket", str(ticket.ticket_id))
        except Exception:
            logger.warning(
                "Failed to enqueue enrichment for ticket %s", ticket.ticket_id, exc_info=True
            )

    return ticket


def _norm(s: str | None) -> str | None:
    if s is None:
        return None
    t = s.strip()
    return t if t else None


REQUIRED_COLUMNS = {"short_desc", "status", "source_system", "external_id"}
EXPECTED_COLUMNS = {
    "short_desc",
    "full_desc",
    "external_id",
    "source_system",
    "resolution",
    "root_cause",
    "priority",
    "status",
}
MAX_CSV_BYTES = 5 * 1024 * 1024  # 5 MB
MAX_ROWS = 5_000


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
        else:
            return None, f"status '{status_raw}' is not valid; expected OPEN or CLOSED"
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
    is_test: bool = Query(False, description="Mark all uploaded tickets as test data"),
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    """Parse CSV in memory, validate each row with TicketCreate, insert valid rows."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV (filename ending in .csv)")

    # File size cap
    content = await file.read(MAX_CSV_BYTES + 1)
    if len(content) > MAX_CSV_BYTES:
        raise HTTPException(
            status_code=400, detail=f"CSV file exceeds {MAX_CSV_BYTES // (1024 * 1024)} MB limit"
        )

    try:
        text = content.decode("utf-8", errors="replace")
    except Exception as e:
        raise HTTPException(
            status_code=400, detail=f"File could not be decoded as UTF-8: {e}"
        ) from e

    reader = csv.DictReader(io.StringIO(text))
    if reader.fieldnames is None:
        raise HTTPException(status_code=400, detail="CSV has no header row")

    # Header validation
    fieldnames_lower = {f.strip().lower() for f in reader.fieldnames if f}
    missing = REQUIRED_COLUMNS - fieldnames_lower
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"CSV is missing required columns: {sorted(missing)}",
        )
    unknown = fieldnames_lower - EXPECTED_COLUMNS
    upload_warnings: list[str] = (
        [f"Unrecognised column(s) ignored: {sorted(unknown)}"] if unknown else []
    )

    errors: list[TicketUploadRowError] = []
    tickets_to_add: list[Ticket] = []
    seen_ext_ids: dict[str, int] = {}  # external_id → first row number seen

    for row_index, row in enumerate(reader, start=2):
        # Row count cap (count attempted rows, not just successes)
        if row_index - 1 > MAX_ROWS:
            raise HTTPException(
                status_code=400,
                detail=f"CSV contains more than {MAX_ROWS} rows; split into smaller files",
            )

        payload, row_error = _row_to_payload(row)
        if row_error:
            errors.append(TicketUploadRowError(row=row_index, message=row_error))
            continue

        # Intra-batch duplicate external_id check
        ext_id = payload.get("external_id")
        if ext_id is not None:
            if ext_id in seen_ext_ids:
                errors.append(
                    TicketUploadRowError(
                        row=row_index,
                        message=f"external_id '{ext_id}' already seen at row {seen_ext_ids[ext_id]}",
                    )
                )
                continue
            seen_ext_ids[ext_id] = row_index

        try:
            body = TicketCreate(**payload)
        except ValidationError as e:
            err_msg = e.errors()[0].get("msg", str(e)) if e.errors() else str(e)
            errors.append(TicketUploadRowError(row=row_index, message=err_msg))
            continue
        data = body.model_dump()
        data["is_test"] = is_test
        tickets_to_add.append(
            Ticket(client_id=client_id, enrichment_status=EnrichmentStatus.PENDING, **data)
        )

    # Empty CSV (header only, no data rows)
    if not tickets_to_add and not errors:
        raise HTTPException(status_code=400, detail="CSV contains no data rows")

    if not tickets_to_add:
        result = TicketUploadResult(created=0, errors=errors, warnings=upload_warnings)
        return JSONResponse(content=result.model_dump(), status_code=422)

    db.add_all(tickets_to_add)
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(status_code=500, detail=f"Bulk insert failed: {exc}") from exc

    # Enqueue background enrichment for each ticket (gated by kill switch)
    if settings.enable_enrichment:
        try:
            pool = await get_arq_pool()
            for t in tickets_to_add:
                await pool.enqueue_job("run_enrich_ticket", str(t.ticket_id))
        except Exception:
            logger.warning("Failed to enqueue enrichment for uploaded tickets", exc_info=True)

    return TicketUploadResult(created=len(tickets_to_add), errors=errors, warnings=upload_warnings)


@router.get("/tickets", response_model=list[TicketRead])
async def list_tickets(
    is_test: bool | None = Query(None, description="Filter by test data flag"),
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    stmt = select(Ticket).where(Ticket.client_id == client_id)
    if is_test is not None:
        stmt = stmt.where(Ticket.is_test == is_test)
    result = await db.execute(stmt.order_by(Ticket.created_at.desc()))
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


@router.post("/tickets/{ticket_id}/enrich", response_model=list[TaxonomyRead])
async def enrich_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    """Run AI taxonomy prediction for a ticket synchronously."""
    result = await db.execute(
        select(Ticket).where(Ticket.ticket_id == ticket_id, Ticket.client_id == client_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Deactivate existing active taxonomy predictions
    await db.execute(
        update(TicketTaxonomy)
        .where(
            TicketTaxonomy.ticket_id == ticket_id,
            TicketTaxonomy.client_id == client_id,
            TicketTaxonomy.is_active.is_(True),
        )
        .values(is_active=False)
    )

    try:
        from services.llm import extract_taxonomies

        taxonomies = await extract_taxonomies(db, ticket)
        db.add_all(taxonomies)
    except Exception:
        logger.exception("Enrichment failed for ticket %s", ticket_id)
        await db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Enrichment failed — the AI service may be temporarily unavailable.",
        )

    await db.commit()
    return taxonomies
