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
2. All requests to Railway now come from the Next.js BFF proxy (server-to-server), not the browser
3. Every protected request passes through `get_current_user` FastAPI dependency
4. Token header is inspected for `alg` — ES256 (current) or HS256 (legacy)
5. Verified against matching public key; payload stored in `request.state.user`

See [docs/bff-auth.md](./bff-auth.md) for the full JWT verification flow.

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

## Health Endpoints

| Endpoint | What it checks |
|---|---|
| `GET /health` | App is running |
| `GET /health/db` | SQLAlchemy can execute `SELECT 1` against Supabase |

`/health/db` response: `{"status": "ok", "db": "connected"}`

## Pydantic / SQLAlchemy Sync

On startup, `main.py` asserts that every Pydantic response schema's fields are a subset of the corresponding ORM model's columns:

```python
_assert_schema_subset(Ticket, TicketRead)
_assert_schema_subset(TicketProposal, ProposalRead)
_assert_schema_subset(TicketProposalFeedback, FeedbackRead)
_assert_schema_subset(TicketTaxonomy, TaxonomyRead)
```

If a field is added to a Pydantic schema without a matching ORM column, the app will **crash at startup** with a clear error — catching drift at deploy time, not silently at runtime.

## Deploying (Railway)
- Config: `apps/api/railway.toml`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health checks: `GET /health`, `GET /health/db`
- Env vars set in Railway dashboard (see `docs/deployment.md`)
- `CORS_ORIGINS` is set to `http://localhost:3000` only — browser never calls Railway in production
