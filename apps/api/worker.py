"""ARQ worker configuration for background ticket enrichment."""

import uuid

from arq.connections import RedisSettings

from config import settings


async def run_enrich_ticket(ctx: dict, ticket_id_str: str) -> None:
    """ARQ task wrapper — calls the reusable enrich_ticket()."""
    from services.enrichment import enrich_ticket

    await enrich_ticket(uuid.UUID(ticket_id_str))


class WorkerSettings:
    functions = [run_enrich_ticket]
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
