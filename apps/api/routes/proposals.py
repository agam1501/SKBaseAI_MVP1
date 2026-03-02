import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from db import get_db
from models import TicketProposal, TicketProposalFeedback
from schemas import FeedbackCreate, FeedbackRead, ProposalRead

router = APIRouter(tags=["proposals"])


@router.get("/proposals/tickets/{ticket_id}/latest", response_model=ProposalRead)
async def get_latest_proposal(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TicketProposal)
        .where(TicketProposal.ticket_id == ticket_id, TicketProposal.is_latest == True)
        .order_by(TicketProposal.created_at.desc())
        .limit(1)
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="No proposal found for this ticket")
    return proposal


@router.post("/proposals/{proposal_id}/feedback", response_model=FeedbackRead, status_code=201)
async def submit_feedback(
    proposal_id: uuid.UUID,
    body: FeedbackCreate,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TicketProposal).where(TicketProposal.id == proposal_id)
    )
    proposal = result.scalar_one_or_none()
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposal not found")

    user = getattr(request.state, "user", {})
    from config import settings
    client_id = uuid.UUID(str(user.get("sub", settings.default_client_id)))

    feedback = TicketProposalFeedback(
        proposal_id=proposal_id,
        ticket_id=proposal.ticket_id,
        client_id=client_id,
        user_id=client_id,
        **body.model_dump(),
    )
    db.add(feedback)
    await db.commit()
    await db.refresh(feedback)
    return feedback
