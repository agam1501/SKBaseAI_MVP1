# Scaling Notes

## Ticket Filtering: Client-Side vs Server-Side

**Current (MVP):** All filtering, searching, and sorting on the ticket table is done client-side. The frontend fetches all tickets for a client in one API call and filters in the browser.

**Why this works for now:** With small ticket counts (up to ~500 per client), client-side filtering is fast, simple, and avoids backend changes.

**When to switch to server-side filtering:**

When ticket counts per client grow into the thousands, move filtering to the backend:

1. Accept filter query params on `GET /api/v1/tickets` (e.g. `?status=OPEN&short_desc__contains=apple`)
2. Build dynamic SQLAlchemy `WHERE` clauses from the params in `apps/api/routes/tickets.py`
3. Add pagination (`?page=1&limit=50`) to avoid loading everything at once
4. Frontend sends filters as API params instead of filtering in memory
5. The BFF proxy (`apps/web/app/api/v1/[...path]/route.ts`) already passes through query params, so no changes needed there

**Signs it's time to switch:**
- Dashboard load time feels sluggish
- Ticket counts exceed ~500 per client
- Users report slow search/filter interactions

## Role enforcement is UI-only (backend enforcement needed)

The sidebar and ingestion page perform role checks client-side via `GET /api/v1/me/role`. This means:

- A Responder who knows the URL can still navigate to `/ingestion` directly in the browser
- More critically, anyone with a valid JWT can call `POST /api/v1/tickets/upload` directly (e.g. via curl) regardless of their role

**Endpoints that need backend role enforcement:**

| Endpoint | Required role |
|---|---|
| `POST /tickets/upload` | Admin, Developer |
| `POST /clients` | Admin |
| `POST /clients/{id}/join` | Admin |

**How to add it (FastAPI):**

1. Create a `require_role(allowed: list[str])` dependency in `apps/api/dependencies.py` that reads the user's role from the DB and raises `HTTP 403` if not allowed
2. Apply it to each endpoint: `Depends(require_role(["Admin", "Developer"]))`
3. The existing `GET /api/v1/me/role` endpoint can share the same lookup logic

Until then, role enforcement is a UX convenience only.

## CSV ingestion: no deduplication against existing DB records

`POST /tickets/upload` checks for duplicate `external_id` values **within the uploaded file**,
but it does NOT check whether an `external_id` already exists in the database for that client.
Re-uploading the same CSV will create duplicate tickets silently.

**When to add it:**
When duplicate tickets become a data quality problem (e.g. clients accidentally re-upload
historical exports), add a pre-insert query that cross-checks `external_id` values against
existing rows and rejects matches with per-row errors:

```python
from sqlalchemy import select
existing_ids = {
    r for (r,) in await db.execute(
        select(Ticket.external_id).where(
            Ticket.client_id == client_id,
            Ticket.external_id.in_([t.external_id for t in tickets_to_add if t.external_id]),
        )
    )
}
# then filter tickets_to_add and add row errors for matches
```

This approach keeps the error granular (row-level) rather than failing the whole batch.

## Taxonomy fields fetched but not yet displayed

Columns in `ticket_taxonomies` fetched by the frontend but intentionally not shown in the UI:

| Column | Description | When to show |
|---|---|---|
| `confidence_score` | 0–1 float from AI classifier | When AI taxonomy assignment is live — lets users evaluate prediction quality |
| `source` | Who assigned the taxonomy (`ai`, `manual`, etc.) | When multiple assignment sources exist and need distinguishing |
| `node` | Taxonomy node ID (for linking into the taxonomy reference tree) | When taxonomy drill-down or reference navigation is built |
