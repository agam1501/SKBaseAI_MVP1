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
│   ├── dashboard/page.tsx      # Home after login, links to tickets
│   ├── tickets/
│   │   ├── page.tsx            # Ticket list — calls GET /api/v1/tickets
│   │   └── [id]/page.tsx       # Ticket detail + proposal display
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
```

Requests hit the Next.js BFF proxy at `/api/v1/*`, which handles JWT forwarding to Railway.

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
| `RAILWAY_API_URL` | FastAPI base URL (BFF proxy only) | **No** |

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
