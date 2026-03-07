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
│   ├── tickets.py   # POST /tickets, GET /tickets, GET /tickets/{id}, PATCH /tickets/{id}/status
│   ├── proposals.py # GET /proposals/tickets/{id}/latest, POST /proposals/{id}/feedback
│   └── taxonomies.py# GET /taxonomies/tickets/{id}, GET /taxonomies/business-category, /application, /resolution, /root-cause
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

## Ticket Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/tickets` | Create a single ticket |
| `POST` | `/tickets/upload` | Bulk CSV upload |
| `GET` | `/tickets` | List tickets (search, sort, filter) |
| `GET` | `/tickets/{id}` | Get single ticket (all fields) |
| `PATCH` | `/tickets/{id}/status` | Update `status` + `is_resolved` |

### Status Update

`PATCH /tickets/{id}/status` accepts a `TicketStatusUpdate` body:

```json
{ "status": "CLOSED", "is_resolved": true }
```

Returns the full `TicketRead` response on success. Enforces `client_id` scoping — returns 404 if the ticket belongs to a different client.

## Health Endpoints

| Endpoint | What it checks |
|---|---|
| `GET /health` | App is running |
| `GET /health/db` | SQLAlchemy can execute `SELECT 1` against Supabase |

`/health/db` response: `{"status": "ok", "db": "connected"}`

## Schemas (Pydantic response models)

| Schema | ORM model | Use |
|---|---|---|
| `TicketRead`, `TicketCreate` | `Ticket` | Tickets CRUD |
| `ProposalRead` | `TicketProposal` | Proposals |
| `FeedbackRead`, `FeedbackCreate` | `TicketProposalFeedback` | Feedback |
| `TaxonomyRead` | `TicketTaxonomy` | Taxonomies assigned to a ticket |
| `TaxonomyBusinessCategoryRead` | `TaxonomyBusinessCategory` | GET /taxonomies/business-category |
| `TaxonomyApplicationRead` | `TaxonomyApplication` | GET /taxonomies/application |
| `TaxonomyResolutionRead` | `TaxonomyResolution` | GET /taxonomies/resolution |
| `TaxonomyRootCauseRead` | `TaxonomyRootCause` | GET /taxonomies/root-cause |

All taxonomy reference schemas include: `id`, `client_id`, hierarchy fields (e.g. `l1`, `l2`, `l3` or `l1_outcome`/`l2_action_type`/`l3_resolution_code`), `is_active`, `created_at`, `updated_at`, plus type-specific fields (e.g. `node`, `label`, `keywords` for business category; `resolution_code`, `definition` for resolution). See `apps/api/schemas.py` and `apps/api/models.py` for full field lists.

## Taxonomy list endpoints

All taxonomy list endpoints accept optional filtering by client via the **X-Client-Id** header (same as tickets). If the header is present and the user has access, only rows with that `client_id` or `client_id IS NULL` (global) are returned; if the header is omitted, all rows are returned.

| Endpoint | Response model | Description |
|---|---|---|
| `GET /api/v1/taxonomies/tickets/{ticket_id}` | `list[TaxonomyRead]` | Taxonomies assigned to a ticket |
| `GET /api/v1/taxonomies/business-category` | `list[TaxonomyBusinessCategoryRead]` | Business category reference table |
| `GET /api/v1/taxonomies/application` | `list[TaxonomyApplicationRead]` | Application reference table |
| `GET /api/v1/taxonomies/resolution` | `list[TaxonomyResolutionRead]` | Resolution reference table |
| `GET /api/v1/taxonomies/root-cause` | `list[TaxonomyRootCauseRead]` | Root cause reference table |

## Pydantic / SQLAlchemy Sync

On startup, `main.py` asserts that every Pydantic response schema's fields are a subset of the corresponding ORM model's columns:

```python
_assert_schema_subset(Ticket, TicketRead)
_assert_schema_subset(TicketProposal, ProposalRead)
_assert_schema_subset(TicketProposalFeedback, FeedbackRead)
_assert_schema_subset(TicketTaxonomy, TaxonomyRead)
# Taxonomy reference tables (no startup assert; used only for list endpoints)
# TaxonomyBusinessCategoryRead, TaxonomyApplicationRead, TaxonomyResolutionRead, TaxonomyRootCauseRead
# ORM: TaxonomyBusinessCategory, TaxonomyApplication, TaxonomyResolution, TaxonomyRootCause
```

If a field is added to a Pydantic schema without a matching ORM column, the app will **crash at startup** with a clear error — catching drift at deploy time, not silently at runtime.

## Deploying (Railway)
- Config: `apps/api/railway.toml`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health checks: `GET /health`, `GET /health/db`
- Env vars set in Railway dashboard (see `docs/deployment.md`)
- `CORS_ORIGINS` is set to `http://localhost:3000` only — browser never calls Railway in production
