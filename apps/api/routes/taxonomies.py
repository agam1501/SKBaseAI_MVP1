import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import (
    Ticket,
    TaxonomyApplication,
    TaxonomyBusinessCategory,
    TaxonomyResolution,
    TaxonomyRootCause,
    TicketTaxonomy,
    UserClient,
)
from routes.tickets import get_effective_client_id
from schemas import (
    TaxonomyApplicationRead,
    TaxonomyBusinessCategoryRead,
    TaxonomyCreate,
    TaxonomyRead,
    TaxonomyResolutionRead,
    TaxonomyRootCauseRead,
)

router = APIRouter(tags=["taxonomies"])


async def get_optional_client_id(
    request: Request,
    db: AsyncSession = Depends(get_db),
) -> uuid.UUID | None:
    """Read X-Client-Id header; if present, validate access and return; else None."""
    header = request.headers.get("X-Client-Id")
    if not header:
        return None
    try:
        client_id = uuid.UUID(header)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid X-Client-Id")
    user = getattr(request.state, "user", {})
    user_id = uuid.UUID(str(user.get("sub", settings.default_client_id)))
    result = await db.execute(
        select(UserClient).where(
            UserClient.user_id == user_id,
            UserClient.client_id == client_id,
        )
    )
    if result.scalar_one_or_none() is not None:
        return client_id
    if client_id == user_id or str(client_id) == settings.default_client_id:
        return client_id
    raise HTTPException(status_code=403, detail="Access to this client not allowed")


@router.get("/taxonomies/tickets/{ticket_id}", response_model=list[TaxonomyRead])
async def get_ticket_taxonomies(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    result = await db.execute(
        select(TicketTaxonomy).where(
            TicketTaxonomy.ticket_id == ticket_id,
            TicketTaxonomy.client_id == client_id,
            TicketTaxonomy.is_active,
        )
    )
    return result.scalars().all()


def _client_filter(model, client_id: uuid.UUID | None):
    if client_id is None:
        return select(model)
    return select(model).where(or_(model.client_id.is_(None), model.client_id == client_id))


@router.get(
    "/taxonomies/business-category",
    response_model=list[TaxonomyBusinessCategoryRead],
)
async def list_business_category(
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID | None = Depends(get_optional_client_id),
):
    result = await db.execute(_client_filter(TaxonomyBusinessCategory, client_id))
    return result.scalars().all()


@router.get(
    "/taxonomies/application",
    response_model=list[TaxonomyApplicationRead],
)
async def list_application(
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID | None = Depends(get_optional_client_id),
):
    result = await db.execute(_client_filter(TaxonomyApplication, client_id))
    return result.scalars().all()


@router.get(
    "/taxonomies/resolution",
    response_model=list[TaxonomyResolutionRead],
)
async def list_resolution(
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID | None = Depends(get_optional_client_id),
):
    result = await db.execute(_client_filter(TaxonomyResolution, client_id))
    return result.scalars().all()


@router.get(
    "/taxonomies/root-cause",
    response_model=list[TaxonomyRootCauseRead],
)
async def list_root_cause(
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID | None = Depends(get_optional_client_id),
):
    result = await db.execute(_client_filter(TaxonomyRootCause, client_id))
    return result.scalars().all()


_VALID_TAXONOMY_TYPES = {"business_category", "application", "root_cause", "resolution"}


@router.post(
    "/taxonomies/tickets/{ticket_id}/{taxonomy_type}",
    response_model=TaxonomyRead,
    status_code=201,
)
async def set_ticket_taxonomy(
    ticket_id: uuid.UUID,
    taxonomy_type: str,
    body: TaxonomyCreate,
    db: AsyncSession = Depends(get_db),
    client_id: uuid.UUID = Depends(get_effective_client_id),
):
    """Create or override a taxonomy assignment for a ticket. Marks the previous row inactive."""
    if taxonomy_type not in _VALID_TAXONOMY_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid taxonomy_type. Must be one of: {sorted(_VALID_TAXONOMY_TYPES)}",
        )
    # Verify ticket belongs to this client
    ticket_result = await db.execute(
        select(Ticket).where(Ticket.ticket_id == ticket_id, Ticket.client_id == client_id)
    )
    if ticket_result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Ticket not found")

    # Mark existing active taxonomy rows of this type as inactive
    await db.execute(
        update(TicketTaxonomy)
        .where(
            TicketTaxonomy.ticket_id == ticket_id,
            TicketTaxonomy.client_id == client_id,
            TicketTaxonomy.taxonomy_type == taxonomy_type,
            TicketTaxonomy.is_active.is_(True),
        )
        .values(is_active=False)
    )

    # Insert new taxonomy row
    new_taxonomy = TicketTaxonomy(
        ticket_id=ticket_id,
        client_id=client_id,
        taxonomy_type=taxonomy_type,
        l1=body.l1,
        l2=body.l2,
        l3=body.l3,
        node=body.node,
        source="user",
        is_active=True,
        taxonomy_assigned_at=datetime.now(timezone.utc),
    )
    db.add(new_taxonomy)
    await db.commit()
    await db.refresh(new_taxonomy)
    return new_taxonomy
