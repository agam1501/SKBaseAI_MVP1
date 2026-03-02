# Frontend — Next.js (apps/web/)

## Stack
- **Next.js 14** (App Router)
- **Supabase SSR** (`@supabase/ssr`) — auth with browser client
- **Tailwind CSS** — utility styling
- **dotenv-cli** — loads root `.env` locally (`npm run dev`)

## File Structure

```
apps/web/
├── app/
│   ├── layout.tsx          # Root layout, Tailwind globals
│   ├── page.tsx            # Redirects / → /dashboard
│   ├── login/page.tsx      # Email/password sign in + sign up
│   ├── dashboard/page.tsx  # Home after login, links to tickets
│   └── tickets/
│       ├── page.tsx        # Ticket list — calls GET /api/v1/tickets
│       └── [id]/page.tsx   # Ticket detail + proposal display
├── components/
│   └── ProposalCard.tsx    # Accept/reject proposal UI
├── lib/
│   ├── supabase.ts         # createBrowserClient() helper
│   └── api-client.ts       # Typed fetch wrapper (attaches JWT)
├── package.json            # deps + scripts using dotenv-cli for local
└── vercel.json             # Vercel deployment config
```

## Auth Flow
1. User submits email/password on `/login`
2. `supabase.auth.signInWithPassword()` — Supabase issues JWT (ES256)
3. On protected pages, `supabase.auth.getSession()` retrieves the token
4. Token sent as `Authorization: Bearer <token>` to FastAPI
5. FastAPI verifies and returns data

## API Client
All calls to FastAPI go through `lib/api-client.ts`:
```ts
apiClient.get<Ticket[]>("/api/v1/tickets", token)
apiClient.post("/api/v1/proposals/{id}/feedback", token, body)
```
The base URL is `NEXT_PUBLIC_API_URL` (Railway in production, `localhost:8000` locally).

## Environment Variables
| Variable | Used For |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase browser client |
| `NEXT_PUBLIC_API_URL` | FastAPI base URL |

**Local**: all vars come from root `.env` via `dotenv-cli`
**Production**: vars set directly in Vercel project settings

## Running Locally
```bash
cd apps/web
npm install
npm run dev   # uses dotenv -e ../../.env -- next dev
```

## Deploying (Vercel)
- Config: `apps/web/vercel.json`
- Build command: `next build` (no dotenv-cli on CI)
- Env vars set in Vercel dashboard or via `vercel env add`
