---
name: skbaseai-frontend
description: Next.js frontend conventions, file structure, pages, components, API client usage, auth flow, and environment variables for SKBaseAI. Use when adding pages, modifying UI components, adding nav items, working with the API client, or understanding the frontend architecture.
---

# Frontend — Next.js (apps/web/)

## Stack
- **Next.js 14** (App Router)
- **Supabase SSR** (`@supabase/ssr`) — session stored in HTTP-only cookies
- **Tailwind CSS** — utility styling
- **shadcn/ui** — component library (Button, Card, Input, Select, Badge, Table, Tooltip, etc.)
- **recharts** — charts (use `ComposedChart` for bar+line combos)
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
│   ├── ingestion/page.tsx      # CSV upload; Admin/Developer only
│   ├── taxonomies/             # Sub-nav tabs for each taxonomy reference table
│   ├── tickets/
│   │   ├── page.tsx            # Ticket list
│   │   └── [id]/page.tsx       # Full ticket detail + status toggle + taxonomy card
│   └── api/
│       └── v1/[...path]/
│           └── route.ts        # BFF proxy — forwards all /api/v1/* to Railway
├── components/
│   ├── AppShell.tsx            # Layout wrapper: sidebar + top navbar (skipped on /login)
│   ├── AppSidebar.tsx          # Collapsible left sidebar; add nav items to NAV_ITEMS here
│   ├── TopNav.tsx              # Client selector, user email, sign-out
│   ├── ProposalCard.tsx        # Accept/reject proposal UI
│   └── ui/                     # shadcn components
├── contexts/
│   └── ClientContext.tsx       # Client list + selected client state (persisted in localStorage)
├── lib/
│   ├── types.ts                # Single source of truth for all shared domain types
│   ├── supabase.ts             # createBrowserClient() — for client components
│   ├── supabase-server.ts      # createServerClient() — reads cookies in API routes
│   └── api-client.ts           # Typed fetch wrapper; all API calls go through here
└── vercel.json                 # Vercel deployment config
```

## Auth Flow

1. User submits email/password on `/login`
2. `supabase.auth.signInWithPassword()` — Supabase issues JWT stored as HTTP-only cookie
3. `middleware.ts` runs on every request — refreshes the cookie and redirects if no session
4. Page components call `apiClient.get("/api/v1/tickets")` — **no token needed**
5. `/api/v1/[...path]/route.ts` reads the JWT from the cookie server-side and forwards to Railway

## API Client

All calls go through `lib/api-client.ts` using **relative URLs**:

```ts
apiClient.get<Ticket[]>("/api/v1/tickets")
apiClient.post("/api/v1/proposals/{id}/feedback", body)
apiClient.patch<Ticket>("/api/v1/tickets/{id}/status", { status, is_resolved })
apiClient.uploadTickets("/api/v1/tickets/upload", token, file, { clientId })
```

Pass `{ clientId }` as options for client-scoped endpoints — this sets the `X-Client-Id` header.

## Types

All shared domain types live in `lib/types.ts` — the single source of truth. Never define ticket/client/taxonomy types in page files.

## Navigation

Add items to `NAV_ITEMS` in `components/AppSidebar.tsx`. Role-gated items (visible only to certain roles) use the `roles` array on the nav item config.

| Item | Route | Visible to |
|---|---|---|
| Overview | `/overview` | All roles |
| Analytics | `/analytics` | All roles |
| Dashboard | `/dashboard` | All roles |
| Taxonomies | `/taxonomies` | All roles |
| Ingestion | `/ingestion` | Admin, Developer |

## Global Client Selector

`useClientContext()` from `contexts/ClientContext.tsx` gives `selectedClient` and `loadClients`. The selector lives in `TopNav` and applies to all pages. Use `selectedClient.client_id` to scope API calls.

## Key Pages

### Overview (`/overview`)
Cross-tab matrix of ticket counts: Application L1 (rows) × Business L1 (columns). Data from `GET /api/v1/analytics/cross-tab/business-application`.

### Analytics (`/analytics`)
Monthly ticket volume + MTTR chart built with recharts `ComposedChart`. Chart is wrapped in `overflow-x-auto` with `minWidth` computed at 80px per month (min 500px) to prevent x-axis label overlap on long date ranges.

### Dashboard (`/dashboard`)
Ticket table with power search/filter builder, column sorting, clickable rows → `/tickets/{id}`, and show-test-data toggle.

### Ingestion (`/ingestion`)
CSV upload page, Admin/Developer only. On load calls `GET /api/v1/me/role`; redirects Responders to `/dashboard`. Shows styled alert boxes for errors, warnings, and row-level validation failures.

### Ticket Detail (`/tickets/[id]`)
Full ticket record with Close/Reopen toggle (`PATCH /api/v1/tickets/{id}/status`) and taxonomy card (`GET /api/v1/taxonomies/tickets/{id}`).

## Environment Variables

| Variable | Used For | Reaches Browser? |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser client | Yes |
| `RAILWAY_API_URL` | Backend API base URL (BFF proxy only) | **No** |

**Local**: all vars come from root `.env` via `dotenv-cli`
**Production**: vars set in Vercel project settings

## Running Locally

```bash
cd apps/web
npm install
npm run dev   # uses dotenv -e ../../.env -- next dev
```

To test against deployed Railway instead of local FastAPI:
```
RAILWAY_API_URL=https://adventurous-fascination-production.up.railway.app
```
