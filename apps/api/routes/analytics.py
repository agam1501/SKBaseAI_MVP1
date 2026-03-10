import uuid

from fastapi import APIRouter, Depends
from sqlalchemy import and_, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from db import get_db
from models import TaxonomyApplication, TaxonomyBusinessCategory, TicketTaxonomy
from routes.tickets import get_effective_client_id
from schemas import CrossTabMatrix, CrossTabRow

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/cross-tab/business-application", response_model=CrossTabMatrix)
async def business_application_cross_tab(
    client_id: uuid.UUID = Depends(get_effective_client_id),
    db: AsyncSession = Depends(get_db),
):
    # 1. All distinct business L1s from taxonomy reference table
    biz_result = await db.execute(
        select(TaxonomyBusinessCategory.l1.distinct()).where(
            or_(TaxonomyBusinessCategory.client_id.is_(None), TaxonomyBusinessCategory.client_id == client_id),
            TaxonomyBusinessCategory.is_active == True,  # noqa: E712
        )
    )
    business_l1s = sorted(r for (r,) in biz_result.all())

    # 2. All distinct application L1s from taxonomy reference table
    app_result = await db.execute(
        select(TaxonomyApplication.l1.distinct()).where(
            or_(TaxonomyApplication.client_id.is_(None), TaxonomyApplication.client_id == client_id),
            TaxonomyApplication.is_active == True,  # noqa: E712
        )
    )
    application_l1s = sorted(r for (r,) in app_result.all())

    # 3. Sparse ticket counts (unchanged)
    bc = aliased(TicketTaxonomy)
    app = aliased(TicketTaxonomy)
    counts_result = await db.execute(
        select(
            bc.l1.label("business_l1"),
            app.l1.label("application_l1"),
            func.count(bc.ticket_id.distinct()).label("count"),
        )
        .join(app, and_(bc.ticket_id == app.ticket_id, bc.client_id == app.client_id))
        .where(
            bc.client_id == client_id,
            bc.taxonomy_type == "business_category",
            app.taxonomy_type == "application",
            bc.is_active == True,  # noqa: E712
            app.is_active == True,  # noqa: E712
        )
        .group_by(bc.l1, app.l1)
        .order_by(bc.l1, app.l1)
    )
    counts = [
        CrossTabRow(business_l1=r.business_l1, application_l1=r.application_l1, count=r.count)
        for r in counts_result.all()
    ]

    return CrossTabMatrix(
        business_l1s=business_l1s,
        application_l1s=application_l1s,
        counts=counts,
    )
