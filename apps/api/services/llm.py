# Phase 2: LLM taxonomy extraction and proposal generation
# Requires OPENAI_API_KEY to be set in .env

from openai import AsyncOpenAI

from config import settings

_client: AsyncOpenAI | None = None


def get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def extract_taxonomies(text: str) -> dict:
    """Extract category/subcategory/tags from ticket text via LLM."""
    # TODO: implement in Phase 2
    raise NotImplementedError("LLM services not yet implemented")


async def generate_proposal(ticket_text: str, similar_tickets: list[dict]) -> str:
    """Generate a resolution proposal given similar resolved tickets."""
    # TODO: implement in Phase 2
    raise NotImplementedError("LLM services not yet implemented")
