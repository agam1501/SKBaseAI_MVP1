import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import TicketTaxonomy
from schemas import TaxonomyRead

router = APIRouter(tags=["taxonomies"])


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
