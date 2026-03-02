# Phase 2: text chunking and OpenAI embeddings
# Requires OPENAI_API_KEY to be set in .env

from config import settings


def chunk_text(text: str, max_chars: int = 1500) -> list[str]:
    """Split text into overlapping chunks for embedding."""
    # TODO: implement in Phase 2
    raise NotImplementedError("Embedding services not yet implemented")


async def embed_texts(texts: list[str]) -> list[list[float]]:
    """Batch embed a list of strings using text-embedding-3-small."""
    # TODO: implement in Phase 2
    raise NotImplementedError("Embedding services not yet implemented")


async def embed_single(text: str) -> list[float]:
    """Embed a single string."""
    results = await embed_texts([text])
    return results[0]
