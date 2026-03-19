"""Ticket enrichment: taxonomy prediction (and later embeddings + proposals).

This module contains the reusable enrichment logic. It is trigger-agnostic —
callable from ARQ worker, manual endpoint, or any other context.
"""

import logging
import uuid

from sqlalchemy import select

from db import AsyncSessionLocal
from models import EnrichmentStatus, Ticket

logger = logging.getLogger(__name__)


async def enrich_ticket(ticket_id: uuid.UUID) -> None:
    """Enrich a single ticket: predict taxonomies, save to DB.

    Creates its own DB session (not request-scoped).
    Safe to call from any context: ARQ worker, manual trigger, etc.
    """
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Ticket).where(Ticket.ticket_id == ticket_id))
        ticket = result.scalar_one_or_none()
        if ticket is None:
            logger.error("enrich_ticket: ticket %s not found", ticket_id)
            return

        ticket.enrichment_status = EnrichmentStatus.PROCESSING
        await db.commit()

        try:
            # --- Phase 2a: Taxonomy prediction ---
            from services.llm import extract_taxonomies

            taxonomies = await extract_taxonomies(db, ticket)
            db.add_all(taxonomies)

            # --- Phase 2b: Embeddings (future) ---
            # await generate_embeddings(db, ticket)

            # --- Phase 3: Proposal generation (future) ---
            # await generate_proposal(db, ticket)

            ticket.enrichment_status = EnrichmentStatus.COMPLETED
            await db.commit()
            logger.info(
                "Enrichment completed for ticket %s: %d taxonomies",
                ticket_id,
                len(taxonomies),
            )

        except Exception:
            logger.exception("Enrichment failed for ticket %s", ticket_id)
            # Use a fresh session in case the current one is broken
            async with AsyncSessionLocal() as err_db:
                err_result = await err_db.execute(
                    select(Ticket).where(Ticket.ticket_id == ticket_id)
                )
                t = err_result.scalar_one_or_none()
                if t:
                    t.enrichment_status = EnrichmentStatus.FAILED
                    await err_db.commit()
