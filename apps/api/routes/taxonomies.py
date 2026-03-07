import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from db import get_db
from models import (
    UserClient,
    TicketTaxonomy,
    TaxonomyApplication,
    TaxonomyBusinessCategory,
    TaxonomyResolution,
    TaxonomyRootCause,
)
from schemas import (
    TaxonomyApplicationRead,
    TaxonomyBusinessCategoryRead,
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
):
    result = await db.execute(
        select(TicketTaxonomy).where(
            TicketTaxonomy.ticket_id == ticket_id, TicketTaxonomy.is_active
        )
    )
    return result.scalars().all()


def _client_filter(model, client_id: uuid.UUID | None):
    if client_id is None:
        return select(model)
    return select(model).where(
        or_(model.client_id.is_(None), model.client_id == client_id)
    )


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
    return result.scalars().all()
