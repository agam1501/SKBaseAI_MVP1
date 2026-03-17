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
│   ├── analytics.py # GET /analytics/cross-tab/business-application, GET /analytics/tickets/monthly-stats
│   ├── clients.py   # GET /me/role, GET /clients, POST /clients, POST /clients/{id}/join
│   ├── tickets.py   # POST /tickets, GET /tickets, GET /tickets/{id}, PATCH /tickets/{id}/status, POST /tickets/upload
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

## Model Notes

### UserRole enum mapping
`UserRole` is a Python `str` enum with capitalised values (`"Admin"`, `"Responder"`, `"Developer"`) matching the Postgres `user_role_enum` type. SQLAlchemy defaults to mapping by enum member *name* (lowercase), which causes a `LookupError` when reading rows. The `UserRoles.role` column uses `values_callable=lambda obj: [e.value for e in obj]` to force mapping by *value* instead:

```python
role: Mapped[UserRole] = mapped_column(
    Enum(UserRole, name="user_role_enum", create_type=False,
         values_callable=lambda obj: [e.value for e in obj]),
    nullable=False,
)
```

## User / Role Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/me/role` | Returns the authenticated user's role (`Admin`, `Responder`, `Developer`); 404 if no role assigned |

Role is stored in `public.user_roles` (`user_id`, `role` enum). The ingestion page uses this endpoint to gate access to Admin and Developer roles only.

## Ticket Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/tickets` | Create a single ticket (accepts `is_test` in body, default `false`) |
| `POST` | `/tickets/upload` | Bulk CSV upload (accepts `?is_test=true` query param to mark batch as test data) |
| `GET` | `/tickets` | List tickets (optional `?is_test=true\|false` query param to filter by test flag) |
| `GET` | `/tickets/{id}` | Get single ticket (all fields, includes `is_test`) |
| `PATCH` | `/tickets/{id}/status` | Update `status` + `is_resolved` |

### Status Update

`PATCH /tickets/{id}/status` accepts a `TicketStatusUpdate` body:

```json
{ "status": "CLOSED", "is_resolved": true }
```

Returns the full `TicketRead` response on success. Enforces `client_id` scoping — returns 404 if the ticket belongs to a different client.

### Test Data (`is_test` flag)

Tickets can be marked as test data to isolate them from production views.

- **Create** (`POST /tickets`): include `"is_test": true` in the request body (default `false`)
- **Upload** (`POST /tickets/upload?is_test=true`): pass `is_test=true` as a query param to mark all tickets in the batch
- **List** (`GET /tickets?is_test=false`): filter by test flag — omit the param to return all tickets
- **Frontend**: dashboard has a "Show test data" toggle (default off); test tickets show a TEST badge; upload page has a "Mark as test data" checkbox

## Analytics Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/analytics/cross-tab/business-application` | Returns a full Business L1 × Application L1 cross-tab matrix |
| `GET` | `/analytics/tickets/monthly-stats` | Per-month opened/closed ticket counts and average MTTR (hours) for a client. Query params: `start_month` (YYYY-MM), `end_month` (YYYY-MM). Max range: 24 months. |

### Cross-tab matrix (`CrossTabMatrix`)

Response shape:

```json
{
  "business_l1s": ["Functional", "Technical", ...],
  "application_l1s": ["SAP-S/4HANA", "ServiceNow", ...],
  "counts": [
    { "business_l1": "Functional", "application_l1": "SAP-S/4HANA", "count": 8 }
  ]
}
```

- `business_l1s` and `application_l1s` are **all** distinct L1 values from the taxonomy reference tables (`taxonomy_business_category` and `taxonomy_application`), filtered by `client_id IS NULL OR client_id = <current client>` and `is_active = true`. This ensures every category appears as a row/column even when no tickets have been assigned to it.
- `counts` is the sparse list of non-zero (business_l1, application_l1, count) pairs — only cells with at least one ticket are included.
- The frontend is responsible for filling in zeros for pairs absent from `counts`.

---

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
| `CrossTabRow` | — | One non-zero cell in the cross-tab matrix |
| `CrossTabMatrix` | — | Full response for `GET /analytics/cross-tab/business-application` |
| `MonthlyTicketStat` | — | One month's opened count, closed count, and avg MTTR (hours or null) |
| `MonthlyTicketStatsResponse` | — | Full response for `GET /analytics/tickets/monthly-stats` |

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
