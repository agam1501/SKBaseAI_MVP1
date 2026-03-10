# Enrichment Pipeline — ARQ + Redis Background Processing

## Overview

When tickets are ingested (single create or CSV upload), the system automatically enqueues background enrichment jobs via ARQ (async Redis queue). A separate worker process picks up these jobs and runs taxonomy prediction (and later embeddings + proposals) without blocking the API response.

## Architecture

```
Railway Project
├── API Service (FastAPI)                    ├── Worker Service (ARQ)
│   POST /tickets                            │   Polls Redis every 0.5s
│   POST /tickets/upload                     │   Picks up jobs, runs enrichment
│   POST /tickets/{id}/enrich                │
│     │                                      │   enrich_ticket(ticket_id)
│     └── enqueue job ──> Redis ──> dequeue ──┘     ├─ taxonomy prediction (Phase 2a ✅)
│                                                    ├─ embeddings (Phase 2b 🔜)
│   Returns response immediately                     └─ proposals (Phase 3 🔜)
│   with enrichment_status: PENDING
└────────────────────────────────────────────────────────────────────────────────
```

Wall-clock impact on API response: **zero**. The response returns immediately with `enrichment_status: "PENDING"`. The worker processes enrichment asynchronously.

## How It Works

### 1. Ticket Ingestion (API Side)

When a ticket is created (single or CSV), the route handler:
1. Creates the `Ticket` row with `enrichment_status = PENDING`
2. Commits to DB and returns the response
3. Enqueues an ARQ job: `pool.enqueue_job("run_enrich_ticket", str(ticket_id))`

If the ARQ enqueue fails (e.g., Redis is down), the ticket is still created — enrichment just won't run automatically. The status stays `PENDING` and can be manually triggered later via `POST /tickets/{id}/enrich`.

### 2. Job Processing (Worker Side)

The ARQ worker picks up the job (typically within 0.5s) and calls `enrich_ticket(ticket_id)`:

```
enrich_ticket(ticket_id)
  │
  ├─ Open fresh AsyncSessionLocal (not request-scoped)
  ├─ Load ticket from DB
  ├─ Set enrichment_status = PROCESSING, commit
  │
  ├─ Run extract_taxonomies(db, ticket)
  │   └─ TaxonomyPredictor.predict_for_ticket()
  │       ├─ business_category: L1 → L2 → L3  ┐
  │       ├─ application:       L1 → L2 → L3  ├─ parallel
  │       ├─ resolution:        L1 → L2 → L3  │
  │       └─ root_cause:        L1 → L2 → L3  ┘
  │
  ├─ Save TicketTaxonomy rows to DB
  ├─ Set enrichment_status = COMPLETED, commit
  │
  └─ On error: set enrichment_status = FAILED (via fresh session)
```

### 3. Status Tracking

The `enrichment_status` column on the `tickets` table tracks progress:

| Status | Meaning |
|---|---|
| `NULL` | Legacy ticket (created before enrichment pipeline) |
| `PENDING` | Job enqueued, waiting for worker to pick up |
| `PROCESSING` | Worker is actively running enrichment |
| `COMPLETED` | All enrichment steps finished successfully |
| `FAILED` | Enrichment failed (check worker logs for details) |

The frontend can poll `GET /tickets/{id}` to check status. The `enrichment_status` field is included in every `TicketRead` response.

## Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/tickets` | Creates ticket with `enrichment_status=PENDING`, enqueues enrichment |
| `POST` | `/tickets/upload` | Bulk CSV — all tickets get `PENDING`, one job enqueued per ticket |
| `POST` | `/tickets/{id}/enrich` | Manual (re-)trigger — resets status to `PENDING`, enqueues new job |

The `/enrich` endpoint is useful for:
- Re-running after a failure
- Re-enriching after ticket content changes
- Future "enrich" button in the UI

## File Structure

```
apps/api/
├── arq_pool.py              # Shared ARQ Redis connection pool (get/close)
├── worker.py                # ARQ WorkerSettings + run_enrich_ticket task wrapper
├── services/
│   └── enrichment.py        # enrich_ticket() — reusable core logic
├── routes/
│   └── tickets.py           # Enqueue jobs after ticket create/upload
├── main.py                  # ARQ pool init on startup, close on shutdown
└── tests/
    └── test_enrichment.py   # 8 unit tests (mocked DB + LLM)
```

### Key Files

| File | Purpose |
|---|---|
| `services/enrichment.py` | `enrich_ticket(ticket_id)` — the reusable unit of work. Creates its own DB session, runs taxonomy prediction, updates status. Trigger-agnostic — works from ARQ worker, manual endpoint, or any future context. |
| `worker.py` | ARQ `WorkerSettings` class. Defines `run_enrich_ticket` as the task function wrapper. Start command: `arq worker.WorkerSettings` |
| `arq_pool.py` | `get_arq_pool()` / `close_arq_pool()` — lazy singleton for the ARQ Redis connection. Used by API routes to enqueue jobs and by `main.py` for lifecycle management. |

## Design Decisions

### Why ARQ + Redis (not asyncio.create_task)

| Concern | asyncio.create_task | ARQ + Redis |
|---|---|---|
| Process restart | Tasks lost silently | Jobs persist in Redis, worker retries |
| Resource isolation | Enrichment competes with API for CPU/memory | Separate worker process |
| Concurrency control | Manual semaphore | Built-in `max_jobs` setting |
| Monitoring | None | Redis queue inspection |
| Retry support | Manual | Built-in (configurable) |

### Why enrich_ticket() creates its own DB session

Request-scoped sessions (`get_db()`) are closed after the HTTP response. Since enrichment runs in the worker (a separate process with no HTTP request context), it must create its own `AsyncSessionLocal()` session. This also means:
- Each ticket's enrichment is fully independent
- A failed session doesn't corrupt the next ticket
- Error recovery uses a fresh session to set `FAILED` status

### Graceful degradation

If Redis is down when a ticket is created:
1. The ticket is still inserted into the DB (enrichment_status = PENDING)
2. The `pool.enqueue_job()` call is wrapped in try/except — failure is logged as a warning
3. The API response still returns successfully
4. The ticket can be enriched later via `POST /tickets/{id}/enrich` once Redis is back

## Infrastructure

### Railway Services

| Service | Type | Start Command | Purpose |
|---|---|---|---|
| adventurous-fascination | API | `uvicorn main:app --host 0.0.0.0 --port $PORT` | HTTP API |
| Redis | Plugin | (managed by Railway) | Job queue storage |
| worker | Service | `arq worker.WorkerSettings` | Background job processor |

All three share the same Railway project. The worker service uses the same codebase (root directory: `apps/api`) with a different start command.

### Environment Variables

The worker needs the same env vars as the API:

| Variable | Needed by API | Needed by Worker |
|---|---|---|
| `DATABASE_URL` | Yes | Yes |
| `REDIS_URL` | Yes | Yes |
| `OPENAI_API_KEY` | No (unused directly) | Yes (for LLM calls) |
| `SUPABASE_URL` | Yes | Yes |
| `SUPABASE_ANON_KEY` | Yes | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Yes |
| `SUPABASE_JWT_SECRET` | Yes | Yes (config requires it) |
| `DEFAULT_CLIENT_ID` | Yes | Yes |
| `ENABLE_ENRICHMENT` | Yes (API only) | No |

`ENABLE_ENRICHMENT` (default `true`) is a kill switch for **automatic** enrichment on CSV upload. When `false`, CSV-uploaded tickets are still created with `enrichment_status=PENDING` but no ARQ jobs are enqueued. Manual enrichment via `POST /tickets/{id}/enrich` and single-ticket creation always enqueue regardless of this flag.

On Railway, the worker's env vars are set using reference variables (e.g., `${{Redis.REDIS_URL}}`, `${{adventurous-fascination.DATABASE_URL}}`) so they stay in sync automatically.

### Database

The `enrichment_status` column was added to the `tickets` table via migration:

```sql
CREATE TYPE enrichment_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
ALTER TABLE tickets ADD COLUMN enrichment_status enrichment_status_enum;
```

## Local Development

```bash
# Terminal 1: Redis
docker run -p 6379:6379 redis

# Terminal 2: Worker
cd apps/api
.venv/bin/arq worker.WorkerSettings

# Terminal 3: API
cd apps/api
.venv/bin/uvicorn main:app --reload
```

The default `redis_url` in `config.py` is `redis://localhost:6379/0`, so no `.env` change needed for local Redis.

## Error Handling

| Scenario | Behavior |
|---|---|
| Redis down during ticket creation | Ticket created normally, enrichment not enqueued, status stays PENDING |
| Worker crashes mid-enrichment | Status stays PROCESSING; manual re-trigger via `/enrich` endpoint |
| LLM API failure (one taxonomy type) | Other 3 types still succeed (asyncio.gather with return_exceptions) |
| LLM API failure (all types) | enrich_ticket catches exception, sets status to FAILED |
| Ticket not found by worker | Logged as error, job completes without action |
| DB error during enrichment | Fresh session opened to set FAILED status |

## Testing

### Unit Tests (8 tests in `test_enrichment.py`)

```bash
cd apps/api
.venv/bin/python -m pytest tests/test_enrichment.py -v
```

Covers:
- **enrich_ticket happy path**: loads ticket, calls extract_taxonomies, sets COMPLETED
- **Ticket not found**: logs error, returns early
- **LLM failure**: sets FAILED via fresh session
- **Session isolation**: verifies own AsyncSessionLocal is used
- **Worker config**: run_enrich_ticket registered in WorkerSettings
- **Redis settings**: WorkerSettings uses redis_url from config
- **EnrichmentStatus enum**: all 4 values defined
- **Schema alignment**: enrichment_status in TicketRead

### Integration Testing

For end-to-end testing against real Redis + OpenAI + Supabase:
1. Start Redis locally (`docker run -p 6379:6379 redis`)
2. Start worker (`arq worker.WorkerSettings`)
3. Start API (`uvicorn main:app --reload`)
4. Upload a CSV with 2-3 tickets
5. Poll `GET /tickets` — watch `enrichment_status` transition: `PENDING` → `PROCESSING` → `COMPLETED`
6. Verify `ticket_taxonomies` rows created with valid L1/L2/L3 values

## Future Extensions

The `enrich_ticket()` function is designed as an extensible pipeline. Future enrichment steps plug in as additional function calls:

```python
# services/enrichment.py — future state
async def enrich_ticket(ticket_id):
    # Phase 2a ✅
    taxonomies = await extract_taxonomies(db, ticket)

    # Phase 2b 🔜
    await generate_embeddings(db, ticket)

    # Phase 3 🔜
    await generate_proposal(db, ticket)
```

Each step is independent and can fail without affecting the others (with appropriate error handling).
