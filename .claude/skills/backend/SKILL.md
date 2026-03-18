---
name: skbaseai-backend
description: FastAPI backend conventions, all API endpoints, Pydantic schemas, enrichment pipeline, ARQ worker, and the ENABLE_ENRICHMENT kill switch for SKBaseAI. Use when adding endpoints, modifying routes/schemas, working with the enrichment pipeline, debugging backend behavior, or understanding how tickets flow through the system.
---

# Backend — FastAPI (apps/api/)

## Stack
- **FastAPI** — async web framework
- **SQLAlchemy 2.0 async** — ORM with `AsyncSession`
- **asyncpg** — async Postgres driver
- **python-jose** — JWT verification (ES256)
- **pgvector** — vector similarity (Phase 2)
- **ARQ** — async job queue (enrichment pipeline)

## File Structure

```
apps/api/
├── main.py             # App entrypoint: CORS, JWKS startup, auth dependency, routers
├── config.py           # Pydantic settings loaded from .env / env vars
├── db.py               # Async engine (NullPool) + AsyncSession factory
├── models.py           # SQLAlchemy ORM models matching Supabase schema
├── schemas.py          # Pydantic request/response models
├── arq_pool.py         # Lazy global ARQ Redis pool (enrichment branch)
├── worker.py           # ARQ WorkerSettings + run_enrich_ticket task (enrichment branch)
├── routes/
│   ├── analytics.py    # GET /analytics/cross-tab/business-application, GET /analytics/tickets/monthly-stats
│   ├── clients.py      # GET /me/role, GET /clients, POST /clients, POST /clients/{id}/join
│   ├── tickets.py      # POST /tickets, GET /tickets, GET /tickets/{id}, PATCH /tickets/{id}/status, POST /tickets/upload
│   ├── proposals.py    # GET /proposals/tickets/{id}/latest, POST /proposals/{id}/feedback
│   └── taxonomies.py   # GET /taxonomies/tickets/{id}, GET /taxonomies/business-category, /application, /resolution, /root-cause
└── services/
    ├── enrichment.py   # enrich_ticket() — fetches ticket, calls LLM, updates status (enrichment branch)
    ├── llm.py          # extract_taxonomies(), generate_proposal()
    ├── embeddings.py   # chunk_text(), embed_texts()
    └── retrieval.py    # find_similar_tickets() via pgvector
```

## Auth Flow
1. On startup, backend fetches Supabase JWKS from `{SUPABASE_URL}/auth/v1/.well-known/jwks.json`
2. All requests come from the Next.js BFF proxy (server-to-server)
3. Every protected request passes through `get_current_user` FastAPI dependency
4. Token header inspected for `alg` — ES256 (current) or HS256 (legacy)
5. Verified against matching public key; payload stored in `request.state.user`

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

---

## User / Role Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/me/role` | Returns the authenticated user's role (`Admin`, `Responder`, `Developer`); 404 if no role assigned |

Role is stored in `public.user_roles`. The ingestion page uses this endpoint to gate access to Admin and Developer roles only. **Note:** role enforcement is UI-only — see scaling notes.

---

## Ticket Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/tickets` | Create a single ticket (accepts `is_test` in body, default `false`) |
| `POST` | `/tickets/upload` | Bulk CSV upload (accepts `?is_test=true` query param) |
| `GET` | `/tickets` | List tickets (optional `?is_test=true\|false` filter) |
| `GET` | `/tickets/{id}` | Get single ticket |
| `PATCH` | `/tickets/{id}/status` | Update `status` + `is_resolved` |

### CSV format and constraints (`POST /tickets/upload`)

**Required columns** (HTTP 400 if missing):

| Column | Description |
|---|---|
| `short_desc` | Short description (non-empty) |
| `status` | Must be `OPEN` or `CLOSED` (case-insensitive); any other value → row error |
| `source_system` | Source system identifier |
| `external_id` | Ticket ID in the originating system |

**Optional columns**: `full_desc`, `resolution`, `root_cause`, `priority`

**Rules:**
- Unknown columns → non-fatal warning in response
- Duplicate `external_id` within the file → row error on later occurrence
- File size limit: **5 MB**
- Row limit: **5 000 rows** per upload
- Empty CSV (header only) → HTTP 400

**Response shape:**
```json
{
  "created": 42,
  "errors": [{ "row": 5, "message": "status 'Pending' is not valid; expected OPEN or CLOSED" }],
  "warnings": ["Unrecognised column(s) ignored: ['ticket_notes']"]
}
```

---

## Enrichment Pipeline (ARQ)

> Lives on `agam1501/gwangju-v1` branch — not yet merged to main.

Tickets are always committed to the DB **before** enrichment is attempted. Enrichment is fire-and-forget — failures don't affect ticket persistence.

### Kill switch

Controlled by `ENABLE_ENRICHMENT` env var (set in Railway dashboard):

```python
# config.py
enable_enrichment: bool = True  # reads ENABLE_ENRICHMENT; defaults True if unset
```

| Value | Effect |
|---|---|
| `false` | No enrichment jobs enqueued on CSV upload |
| `true` (default if unset) | Jobs enqueued for every uploaded ticket |

**Set `ENABLE_ENRICHMENT=false` in Railway before merging the enrichment branch.** Flip to `true` only when Redis + worker are running.

### enrichment_status lifecycle

| Status | Meaning |
|---|---|
| `PENDING` | Ticket inserted, job queued, worker hasn't started yet |
| `PROCESSING` | Worker picked up the job |
| `COMPLETED` | Taxonomies extracted and saved |
| `FAILED` | Exception during enrichment; ticket is safe, enrichment can be retried via `POST /tickets/{id}/enrich` |

### Enrichment trigger points in `routes/tickets.py`

- `POST /tickets/upload` — enqueues jobs after bulk commit; gated by `settings.enable_enrichment`
- `POST /tickets` — enqueues job after single ticket commit; always attempts (no flag check — intentional, single creates are explicit)
- `POST /tickets/{id}/enrich` — manual re-trigger; always attempts; for admin reprocessing

### Key files (enrichment branch)

| File | Role |
|---|---|
| `apps/api/worker.py` | ARQ `WorkerSettings` + `run_enrich_ticket()` task |
| `apps/api/services/enrichment.py` | `enrich_ticket()` — sets PROCESSING, calls LLM, sets COMPLETED/FAILED; uses fresh DB session for error recovery |
| `apps/api/arq_pool.py` | Lazy global ARQ Redis pool; non-fatal if Redis unavailable at startup |

### Running the worker locally
```bash
cd apps/api
.venv/bin/arq worker.WorkerSettings
# Requires Redis running and REDIS_URL in .env
```

---

## Analytics Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/analytics/cross-tab/business-application` | Business L1 × Application L1 cross-tab matrix |
| `GET` | `/analytics/tickets/monthly-stats` | Per-month opened/closed counts + avg MTTR (hours). Params: `start_month`, `end_month` (YYYY-MM). Max 24 months. |

---

## Health Endpoints

| Endpoint | What it checks |
|---|---|
| `GET /health` | App is running |
| `GET /health/db` | SQLAlchemy can execute `SELECT 1` |

---

## Schemas (Pydantic response models)

| Schema | ORM model | Use |
|---|---|---|
| `TicketRead`, `TicketCreate` | `Ticket` | Tickets CRUD |
| `TicketUploadResult` | — | CSV upload response (includes `created`, `errors`, `warnings`) |
| `ProposalRead` | `TicketProposal` | Proposals |
| `FeedbackRead`, `FeedbackCreate` | `TicketProposalFeedback` | Feedback |
| `TaxonomyRead` | `TicketTaxonomy` | Taxonomies assigned to a ticket |
| `TaxonomyBusinessCategoryRead` | `TaxonomyBusinessCategory` | Reference table |
| `TaxonomyApplicationRead` | `TaxonomyApplication` | Reference table |
| `TaxonomyResolutionRead` | `TaxonomyResolution` | Reference table |
| `TaxonomyRootCauseRead` | `TaxonomyRootCause` | Reference table |
| `CrossTabMatrix` | — | Cross-tab analytics response |
| `MonthlyTicketStatsResponse` | — | Monthly stats analytics response |

On startup, `main.py` asserts every Pydantic response schema's fields are a subset of the ORM model's columns — schema drift crashes at startup, not silently at runtime.

## Model Notes

### UserRole enum mapping
`UserRole` uses `values_callable=lambda obj: [e.value for e in obj]` to force SQLAlchemy to map by enum *value* (`"Admin"`) not *name* (`"admin"`):

```python
role: Mapped[UserRole] = mapped_column(
    Enum(UserRole, name="user_role_enum", create_type=False,
         values_callable=lambda obj: [e.value for e in obj]),
    nullable=False,
)
```

## Deploying (Railway)
- Config: `apps/api/railway.toml`
- Start command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
- Health checks: `GET /health`, `GET /health/db`
- `CORS_ORIGINS` = localhost only — browser never calls Railway in production
