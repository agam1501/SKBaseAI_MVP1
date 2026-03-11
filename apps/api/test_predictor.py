"""Quick integration test for TaxonomyPredictor — run against real DB + OpenAI."""

import asyncio
import time

from sqlalchemy import select

from db import AsyncSessionLocal
from models import Ticket
from services.taxonomy_predictor import TaxonomyPredictor


async def main():
    async with AsyncSessionLocal() as db:
        # Grab one ticket
        result = await db.execute(select(Ticket).limit(1))
        ticket = result.scalar_one_or_none()
        if not ticket:
            print("No tickets in DB!")
            return

        print(f"Ticket: {ticket.ticket_id}")
        print(f"  short_desc: {ticket.short_desc[:100]}")
        print(f"  client_id:  {ticket.client_id}")
        print()

        predictor = TaxonomyPredictor()
        start = time.perf_counter()
        taxonomies = await predictor.predict_for_ticket(db, ticket)
        elapsed = time.perf_counter() - start

        print(f"Predicted {len(taxonomies)} taxonomies in {elapsed:.1f}s\n")
        for t in taxonomies:
            print(f"  {t.taxonomy_type}:")
            print(f"    L1: {t.l1}")
            print(f"    L2: {t.l2}")
            print(f"    L3: {t.l3}")
            print(f"    node: {t.node}")
            print(f"    confidence: {t.confidence_score}")
            print(f"    source: {t.source}")
            print()


if __name__ == "__main__":
    asyncio.run(main())
