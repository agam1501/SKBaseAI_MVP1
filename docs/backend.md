# Backend — FastAPI (apps/api/)

## Stack
- **FastAPI** — async web framework
- **SQLAlchemy 2.0 async** — ORM with `AsyncSession`
- **asyncpg** — async Postgres driver
- **python-jose** — JWT verification (ES256)
- **pgvector** — vector similarity (Phase 2)
- **ARQ** — async job queue (Phase 3)

## File Structure

```
apps/api/
├── main.py          # App entrypoint: CORS, JWKS startup, auth dependency, routers
├── config.py        # Pydantic settings loaded from .env
├── db.py            # Async engine (NullPool) + AsyncSession factory
├── models.py        # SQLAlchemy ORM models matching Supabase schema
├── schemas.py       # Pydantic request/response models
├── routes/
│   ├── tickets.py   # POST /tickets, GET /tickets, GET /tickets/{id}
│   ├── proposals.py # GET /proposals/tickets/{id}/latest, POST /proposals/{id}/feedback
│   └── taxonomies.py# GET /taxonomies/tickets/{id}
└── services/
    ├── llm.py       # extract_taxonomies(), generate_proposal() — Phase 2 stub
    ├── embeddings.py# chunk_text(), embed_texts() — Phase 2 stub
    └── retrieval.py # find_similar_tickets() via pgvector — Phase 2 stub
```

## Auth Flow
1. On startup, backend fetches Supabase JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
2. Every protected request passes through `get_current_user` FastAPI dependency
3. Token header is inspected for `alg` — ES256 (current) or HS256 (legacy)
4. Verified against matching public key; payload stored in `request.state.user`

## DB Connection Pattern
```python
engine = create_async_engine(
    DATABASE_URL,        # port 6543 = Transaction Mode pooler
    poolclass=NullPool,  # Supavisor manages pool externally
    connect_args={"statement_cache_size": 0}  # required for Transaction Mode
)
```

## Running Locally
```bash
cd apps/api
python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/uvicorn main:app --reload
```

## Deploying (Railway)
- Config: `apps/api/railway.toml`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health check: `GET /health`
- Env vars set in Railway dashboard (see `docs/deployment.md`)
