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
│   ├── layout.tsx              # Root layout, Tailwind globals
│   ├── page.tsx                # Redirects / → /dashboard
│   ├── login/page.tsx          # Email/password sign in + sign up
│   ├── dashboard/page.tsx      # Ticket table with search, sort, filter, clickable rows
│   ├── tickets/
│   │   ├── page.tsx            # Ticket list — calls GET /api/v1/tickets
│   │   └── [id]/page.tsx       # Full ticket detail + status toggle (Close/Reopen)
│   └── api/
│       └── v1/[...path]/
│           └── route.ts        # BFF proxy — forwards all /api/v1/* to Railway
├── components/
│   └── ProposalCard.tsx        # Accept/reject proposal UI
├── lib/
│   ├── supabase.ts             # createBrowserClient() — for login page only
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

## Dashboard — Ticket Table

`app/dashboard/page.tsx` is the main post-login view. Features:

- **Power search / filter builder** — choose a field, operator, and value; multiple filters are ANDed
- **Column sorting** — click column headers (External ID, Short Desc, Status, Created) to toggle asc/desc
- **Clickable rows** — each `<tr>` has `cursor-pointer` + `onClick` → navigates to `/tickets/{id}`

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

The **Close/Reopen** button calls `PATCH /api/v1/tickets/{id}/status` and updates local state on success. Back link goes to `/dashboard` (not `/tickets`).

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
