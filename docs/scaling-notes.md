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

## Taxonomy fields fetched but not yet displayed

Columns in `ticket_taxonomies` fetched by the frontend but intentionally not shown in the UI:

| Column | Description | When to show |
|---|---|---|
| `confidence_score` | 0–1 float from AI classifier | When AI taxonomy assignment is live — lets users evaluate prediction quality |
| `source` | Who assigned the taxonomy (`ai`, `manual`, etc.) | When multiple assignment sources exist and need distinguishing |
| `node` | Taxonomy node ID (for linking into the taxonomy reference tree) | When taxonomy drill-down or reference navigation is built |
