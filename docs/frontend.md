# Frontend — Next.js (apps/web/)

## Stack
- **Next.js 14** (App Router)
- **Supabase SSR** (`@supabase/ssr`) — session stored in HTTP-only cookies
- **Tailwind CSS** — utility styling
- **dotenv-cli** — loads root `.env` locally (`npm run dev`)

## File Structure

```
apps/web/
├── middleware.ts               # Session cookie refresh + auth redirect guard
├── app/
│   ├── layout.tsx              # Root layout — wraps children in ClientProvider + AppShell
│   ├── page.tsx                # Redirects / → /dashboard
│   ├── login/page.tsx          # Email/password sign in + sign up
│   ├── analytics/page.tsx      # Month range picker + ComposedChart (opened/closed bars + MTTR line)
│   ├── overview/page.tsx       # Cross-tab matrix: Application L1 (rows) × Business L1 (columns)
│   ├── dashboard/page.tsx      # Ticket table with search, sort, filter, clickable rows
│   ├── ingestion/
│   │   └── page.tsx            # CSV upload + history placeholder; Admin/Developer only
│   ├── taxonomies/
│   │   ├── layout.tsx          # Sub-nav tabs (Overview, Business category, Application, Resolution, Root cause)
│   │   └── ...                 # Individual taxonomy pages
│   ├── tickets/
│   │   ├── page.tsx            # Ticket list — calls GET /api/v1/tickets
│   │   └── [id]/page.tsx       # Full ticket detail + status toggle (Close/Reopen) + taxonomy card
│   └── api/
│       └── v1/[...path]/
│           └── route.ts        # BFF proxy — forwards all /api/v1/* to Railway
├── components/
│   ├── AppShell.tsx            # Layout wrapper: sidebar + top navbar (skipped on /login)
│   ├── AppSidebar.tsx          # Collapsible left sidebar with role-gated nav items + drag-to-resize
│   ├── TopNav.tsx              # Persistent top bar: client selector, user email, sign-out
│   ├── ProposalCard.tsx        # Accept/reject proposal UI
│   └── ui/                     # shadcn components
├── contexts/
│   └── ClientContext.tsx       # Client list + selected client state (persisted in localStorage)
├── hooks/
│   └── use-mobile.tsx          # Detects mobile viewport (used by shadcn sidebar)
├── lib/
│   ├── supabase.ts             # createBrowserClient() — for client components
│   ├── supabase-server.ts      # createServerClient() — reads cookies in API routes
│   └── api-client.ts           # Typed fetch wrapper (relative URLs, no token param)
├── package.json                # deps + scripts using dotenv-cli for local
└── vercel.json                 # Vercel deployment config
```

## Auth Flow

See [docs/bff-auth.md](./bff-auth.md) for the full visual breakdown. In summary:

1. User submits email/password on `/login`
2. `supabase.auth.signInWithPassword()` — Supabase issues JWT stored as HTTP-only cookie
3. `middleware.ts` runs on every request — refreshes the cookie and redirects if no session
4. Page components call `apiClient.get("/api/v1/tickets")` — **no token needed**
5. `/api/v1/[...path]/route.ts` reads the JWT from the cookie server-side and forwards to Railway

## API Client

All calls go through `lib/api-client.ts` using **relative URLs** — no token parameter:

```ts
apiClient.get<Ticket[]>("/api/v1/tickets")
apiClient.post("/api/v1/proposals/{id}/feedback", body)
apiClient.patch<Ticket>("/api/v1/tickets/{id}/status", { status, is_resolved })
```

Requests hit the Next.js BFF proxy at `/api/v1/*`, which handles JWT forwarding to Railway.

## Navigation (AppShell)

All pages except `/login` are wrapped in `AppShell`, which renders:

### Sidebar (`AppSidebar`)
- Collapsible to an icon-only rail (shadcn `collapsible="icon"`)
- Drag-to-resize: a 4px handle on the right edge lets users drag width between 160–480px; hidden when collapsed
- Collapse toggle (`SidebarTrigger`) in the footer, right-aligned
- Role-gated nav items — fetched on mount from `GET /api/v1/me/role`:

| Item | Route | Visible to |
|---|---|---|
| Overview | `/overview` | All roles |
| Analytics | `/analytics` | All roles |
| Dashboard | `/dashboard` | All roles |
| Taxonomies | `/taxonomies` | All roles |
| Ingestion | `/ingestion` | Admin, Developer |

While the role is loading or if the endpoint fails, all items are shown (fail-open). Once role resolves to `Responder`, Ingestion is hidden.

### Top Navbar (`TopNav`)
- **Client selector** — shadcn `Select` backed by `ClientContext`; switches the active client on any page
- **User email** — displayed on the right (hidden on small screens)
- **Sign out** — calls `supabase.auth.signOut()` and redirects to `/login`

## Overview Page

`app/overview/page.tsx` is the first page shown after login. It displays a cross-tab matrix of ticket counts broken down by **Application L1** (rows) × **Business L1** (columns).

### Data source

Calls `GET /api/v1/analytics/cross-tab/business-application` which returns a `CrossTabMatrix`:

```json
{
  "business_l1s": ["Functional", "Technical", ...],
  "application_l1s": ["SAP-S/4HANA", "ServiceNow", ...],
  "counts": [{ "business_l1": "Functional", "application_l1": "SAP-S/4HANA", "count": 8 }, ...]
}
```

The backend fetches **all L1 values from the taxonomy reference tables** (not just those with tickets), so every category always appears as a row/column — even if its count is zero.

### Matrix behaviour

- **Rows** = Application L1 values (all, from `taxonomy_application` reference table)
- **Columns** = Business L1 values (all, from `taxonomy_business_category` reference table)
- **Zero cells** are visually de-emphasised (`text-muted-foreground text-xs`)
- **Non-zero cells** are highlighted (`bg-blue-50 font-medium`)
- **Totals row** is sticky at the bottom of the scroll container
- **Header row** is sticky at the top
- **First column** (Application L1 label) is sticky left

### Controls

| Control | Behaviour |
|---|---|
| Application filter (text input) | Filters visible rows by substring match on Application L1 name; totals update live |
| Vertical scroll | Table body scrolls within a `max-h-[480px]` container; header and totals row remain fixed |
| Horizontal scroll | Outer container scrolls horizontally when columns overflow |

---

## Analytics Page

`app/analytics/page.tsx` shows ticket volume and resolution speed over a user-selected
date range.

### Controls

| Control | Behaviour |
|---|---|
| Start / End month inputs | `<Input type="month">` for YYYY-MM range; client-side validation rejects `start > end` before fetching |
| Apply button | Triggers fetch; disabled while loading |
| Company | Comes from the global `ClientContext` (TopNav selector); no local selector |

### Chart

Built with [recharts](https://recharts.org/) `ComposedChart`:

| Series | Type | Y-axis | Color |
|---|---|---|---|
| Opened | `<Bar>` | Left (ticket count) | Indigo `#6366f1` |
| Closed | `<Bar>` | Left (ticket count) | Emerald `#10b981` |
| Avg MTTR (hrs) | `<Line>` | Right (hours) | Amber `#f59e0b` |

- Custom tooltip: appears on hover showing opened count, closed count, and MTTR for that month
- Horizontal scroll: chart container is `overflow-x-auto`; chart `minWidth` scales at 80px per month (minimum 500px) so x-axis labels never overlap for long ranges

### Data source

`GET /api/v1/analytics/tickets/monthly-stats?start_month=YYYY-MM&end_month=YYYY-MM`

Returns a `MonthlyTicketStatsResponse` with one `MonthlyTicketStat` per month in the
range, including months with zero tickets. `avg_mttr_hours` is `null` for months with
no resolved tickets.

---

## Dashboard — Ticket Table

`app/dashboard/page.tsx` is the main post-login view. Features:

- **Power search / filter builder** — choose a field, operator, and value; multiple filters are ANDed
- **Column sorting** — click column headers (External ID, Short Desc, Status, Created) to toggle asc/desc
- **Clickable rows** — each `<tr>` has `cursor-pointer` + `onClick` → navigates to `/tickets/{id}`
- **Show test data toggle** — checkbox to include/exclude tickets marked `is_test`; hidden when no tickets loaded

## Ticket Detail Page

`app/tickets/[id]/page.tsx` shows the full ticket record:

| Field | Notes |
|---|---|
| Status | Displayed with color (amber = open, gray = closed); includes **Close / Reopen** toggle button |
| Priority | |
| External ID / Source System | |
| Created / Updated / Resolved At | Formatted via `toLocaleString()` |
| Short / Full Description | Full desc rendered with `whitespace-pre-wrap` |
| Root Cause | |
| Resolution | |
| Cleaned Text | NLP-cleaned version of the description |
| Taxonomies | Card below the main ticket card; grouped by type (Business, Application, Root Cause, Resolution); each level shown as labeled fields (e.g. "Business L1", "Business L2", "Business L3"); fetched from `GET /api/v1/taxonomies/tickets/{id}` |

The **Close/Reopen** button calls `PATCH /api/v1/tickets/{id}/status` and updates local state on success. Back link goes to `/dashboard` (not `/tickets`).

## Ingestion Page

`app/ingestion/page.tsx` is gated to **Admin** and **Developer** roles only. On load it calls `GET /api/v1/me/role`; if the role is `Responder` or no role is assigned, the user is redirected to `/dashboard`.

| Section | Description |
|---|---|
| Upload Tickets (CSV) | File picker + upload button; calls `POST /api/v1/tickets/upload`; shows created count and row-level errors |
| Ingestion History | Placeholder — run-level history will appear here once job tracking is added to the backend |

The old `/upload_tickets` route now redirects to `/ingestion` to preserve any existing bookmarks.

## Middleware

`middleware.ts` runs before every page request:

```
Every request
      │
      ▼
createServerClient() reads cookie
      │
      ├── valid session → refresh cookie if needed → continue
      └── no session    → redirect to /login
                          (except /login itself)
```

The matcher skips `_next/static`, `_next/image`, and `favicon.ico`.

## Environment Variables

| Variable | Used For | Reaches Browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser client | Yes |
| `RAILWAY_API_URL` | Backend API base URL (BFF proxy only) | **No** |

**Local**: all vars come from root `.env` via `dotenv-cli`
**Production**: vars set in Vercel project settings (`vercel env add`)

Note: `NEXT_PUBLIC_API_URL` has been removed. The Railway URL is now server-only.

## Running Locally

```bash
cd apps/web
npm install
npm run dev   # uses dotenv -e ../../.env -- next dev
```

### Local dev against Railway backend

To test against the deployed Railway API instead of a local FastAPI, set in `.env`:
```
RAILWAY_API_URL=https://adventurous-fascination-production.up.railway.app
```
Then `npm run dev` — browser → Next.js dev (3000) → Railway.

Revert to `http://localhost:8000` for fully local development.

## Deploying (Vercel)

- Config: `apps/web/vercel.json`
- Build command: `next build`
- Env vars required: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `RAILWAY_API_URL`
