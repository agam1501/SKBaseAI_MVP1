import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import and_, func, literal_column, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import aliased

from db import get_db
from models import TaxonomyApplication, TaxonomyBusinessCategory, Ticket, TicketTaxonomy
from routes.tickets import get_effective_client_id
from schemas import CrossTabMatrix, CrossTabRow, MonthlyTicketStat, MonthlyTicketStatsResponse

router = APIRouter(prefix="/analytics", tags=["analytics"])


@router.get("/cross-tab/business-application", response_model=CrossTabMatrix)
async def business_application_cross_tab(
    client_id: uuid.UUID = Depends(get_effective_client_id),
    db: AsyncSession = Depends(get_db),
):
    # 1. All distinct business L1s from taxonomy reference table
    biz_result = await db.execute(
        select(TaxonomyBusinessCategory.l1.distinct()).where(
            or_(
                TaxonomyBusinessCategory.client_id.is_(None),
                TaxonomyBusinessCategory.client_id == client_id,
            ),
            TaxonomyBusinessCategory.is_active == True,  # noqa: E712
        )
    )
    business_l1s = sorted(r for (r,) in biz_result.all())

    # 2. All distinct application L1s from taxonomy reference table
    app_result = await db.execute(
        select(TaxonomyApplication.l1.distinct()).where(
            or_(
                TaxonomyApplication.client_id.is_(None), TaxonomyApplication.client_id == client_id
            ),
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


@router.get("/tickets/monthly-stats", response_model=MonthlyTicketStatsResponse)
async def monthly_ticket_stats(
    start_month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    end_month: str = Query(..., pattern=r"^\d{4}-\d{2}$", description="YYYY-MM"),
    client_id: uuid.UUID = Depends(get_effective_client_id),
    db: AsyncSession = Depends(get_db),
):
    """Return per-month opened/closed counts and average MTTR for a client."""
    try:
        start_dt = datetime.strptime(start_month, "%Y-%m").replace(tzinfo=timezone.utc)
        end_dt = datetime.strptime(end_month, "%Y-%m").replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM.")

    if start_dt > end_dt:
        raise HTTPException(status_code=400, detail="start_month must be before end_month.")

    # Limit to 24 months
    months_diff = (end_dt.year - start_dt.year) * 12 + (end_dt.month - start_dt.month)
    if months_diff > 23:
        raise HTTPException(status_code=400, detail="Date range cannot exceed 24 months.")

    # Exclusive upper bound: first day of the month after end_month
    if end_dt.month == 12:
        end_exclusive = datetime(end_dt.year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        end_exclusive = datetime(end_dt.year, end_dt.month + 1, 1, tzinfo=timezone.utc)

    # Build full month list
    all_months = []
    y, m = start_dt.year, start_dt.month
    while (y, m) <= (end_dt.year, end_dt.month):
        all_months.append(f"{y:04d}-{m:02d}")
        m += 1
        if m > 12:
            m = 1
            y += 1

    # Query opened tickets grouped by month
    opened_result = await db.execute(
        select(
            func.to_char(Ticket.created_at, literal_column("'YYYY-MM'")).label("month"),
            func.count().label("count"),
        )
        .where(
            Ticket.client_id == client_id,
            Ticket.created_at >= start_dt,
            Ticket.created_at < end_exclusive,
        )
        .group_by(func.to_char(Ticket.created_at, literal_column("'YYYY-MM'")))
    )
    opened_by_month = {r.month: r.count for r in opened_result.all()}

    # Query closed tickets grouped by month (by resolved_at), with avg MTTR
    closed_result = await db.execute(
        select(
            func.to_char(Ticket.resolved_at, literal_column("'YYYY-MM'")).label("month"),
            func.count().label("count"),
            func.avg(
                func.date_part("epoch", Ticket.resolved_at - Ticket.created_at) / 3600.0
            ).label("avg_mttr_hours"),
        )
        .where(
            Ticket.client_id == client_id,
            Ticket.is_resolved.is_(True),
            Ticket.resolved_at.is_not(None),
            Ticket.resolved_at >= start_dt,
            Ticket.resolved_at < end_exclusive,
        )
        .group_by(func.to_char(Ticket.resolved_at, literal_column("'YYYY-MM'")))
    )
    closed_rows = {r.month: (r.count, r.avg_mttr_hours) for r in closed_result.all()}

    stats = [
        MonthlyTicketStat(
            month=month,
            opened=opened_by_month.get(month, 0),
            closed=closed_rows.get(month, (0, None))[0],
            avg_mttr_hours=round(float(closed_rows[month][1]), 2) if month in closed_rows and closed_rows[month][1] is not None else None,
        )
        for month in all_months
    ]

    return MonthlyTicketStatsResponse(stats=stats)
