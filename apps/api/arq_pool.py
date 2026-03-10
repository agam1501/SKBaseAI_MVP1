"""Shared ARQ connection pool for enqueuing background jobs."""

from arq import ArqRedis, create_pool
from arq.connections import RedisSettings

from config import settings

_pool: ArqRedis | None = None


async def get_arq_pool() -> ArqRedis:
    """Return (and lazily create) the shared ARQ Redis connection pool."""
    global _pool
    if _pool is None:
        _pool = await create_pool(RedisSettings.from_dsn(settings.redis_url))
    return _pool


async def close_arq_pool() -> None:
    """Close the ARQ pool. Call on app shutdown."""
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
