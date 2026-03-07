# BFF Pattern, Auth & JWT Flow

## What Changed and Why

Previously, the browser called Railway directly. This created three problems:

1. **CORS** — Railway had to whitelist Vercel origins and handle preflight requests
2. **JWT in browser storage** — The token lived in `localStorage`/memory, accessible to JS
3. **Token plumbing** — Every component had to call `supabase.auth.getSession()` and thread the token into every API call

The fix is the **BFF (Backend For Frontend)** pattern: Next.js API routes act as a server-side proxy. The browser only ever talks to Vercel. Railway is never reachable from a browser.

---

## Architecture: Before vs After

### Before — Direct browser → Railway

```
┌─────────────────────────────────────────────────────────────────┐
│  Browser (client)                                               │
│                                                                 │
│  1. supabase.auth.getSession()  ──────────────►  Supabase Auth │
│                          ◄── JWT (ES256 token) ─────────────── │
│                                                                 │
│  2. fetch(NEXT_PUBLIC_API_URL + "/api/v1/tickets", {           │
│       headers: { Authorization: "Bearer <jwt>" }               │  ← token visible
│     })                                                          │    in browser
│         │                                                       │
│         ▼                                                       │
│  ┌─────────────────────────┐                                    │
│  │  Railway (FastAPI)       │  ← must allow CORS from Vercel   │
│  │  - verify JWT            │                                   │
│  │  - query Supabase DB     │                                   │
│  └─────────────────────────┘                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Problems:** CORS headers required on Railway · JWT exposed to JS · Token passed manually everywhere

---

### After — BFF proxy (current)

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Browser                        Vercel (Next.js)         Railway         │
│                                                                          │
│  1. POST /login                                                          │
│  ─────────────────────────────►                                          │
│                                 supabase.auth.signIn()                   │
│                                 ──────────────────────────► Supabase     │
│                                 ◄── JWT ───────────────────              │
│                                 Set-Cookie: sb-* (HTTP-only) ◄──────┐   │
│  ◄──────────────────────────── 302 /dashboard                       │   │
│                                                          JWT stored  │   │
│                                                          in cookie,  │   │
│                                                          never in JS │   │
│                                                                          │
│  2. GET /tickets  (page load)                                            │
│  ─────────────────────────────►                                          │
│                                 middleware.ts runs:                      │
│                                 - reads cookie → getUser()               │
│                                 - user found → continue                  │
│                                 - no user   → 302 /login                 │
│                                                                          │
│  3. fetch("/api/v1/tickets")   ← relative URL, same origin              │
│  ─────────────────────────────►                                          │
│                                 /api/v1/[...path]/route.ts:              │
│                                 - reads JWT from cookie (server-side)    │
│                                 - fetch(BACKEND_URL, {                   │
│                                     Authorization: Bearer <jwt>          │
│                                   })  ──────────────────────────────►   │
│                                                              verify JWT  │
│                                                              query DB    │
│                                 ◄── { tickets: [...] } ─────────────    │
│  ◄──────────────────────────── 200 { tickets: [...] }                   │
└──────────────────────────────────────────────────────────────────────────┘
```

**Result:** No CORS on Railway · JWT never touches browser JS · No token threading in components

---

## Cookie-Based JWT: How Supabase SSR Works

Supabase SSR (`@supabase/ssr`) stores the session in **HTTP-only cookies** instead of `localStorage`.

```
Cookie: sb-<project>-auth-token=<base64-encoded-session>
        ┌──────────────┐
        │ HttpOnly     │  ← JS cannot read this (document.cookie won't see it)
        │ SameSite=Lax │  ← not sent on cross-site requests
        │ Secure       │  ← HTTPS only (in production)
        └──────────────┘
```

The browser **automatically** sends these cookies on every request to the same origin. No `Authorization` header needed from the browser side.

### Cookie lifecycle

```
Login                 Middleware              Token Expiry
  │                      │                       │
  ▼                      ▼                       ▼
Supabase issues     Runs on every request   Supabase SSR auto-
session cookie      - checks cookie          refreshes via
(access + refresh)  - calls getUser()        refresh token
                    - if expired, exchanges  before it expires
                      refresh token for
                      new access token
                    - updates cookie
                      in response
```

---

## The Three New Files

### 1. `middleware.ts` — Session guard

Runs **before every page render**, server-side, on Vercel's edge.

```
Request arrives
      │
      ▼
createServerClient()  ← reads cookies from request headers
      │
      ▼
supabase.auth.getUser()
      │
      ├── user found ──► allow request through
      │                  (updated cookies written to response)
      │
      └── no user ─────► 302 redirect to /login
                         (unless path starts with /login)
```

Key detail: `getUser()` is used instead of `getSession()` because it validates the token server-side with Supabase, not just reads it from the cookie.

### 2. `lib/supabase-server.ts` — Server-side client

```ts
// Browser client (lib/supabase.ts)
createBrowserClient()   // reads from localStorage / memory

// Server client (lib/supabase-server.ts)
createServerClient()    // reads from Next.js cookies() store
                        // used in API routes (read-only)
```

The server client is **read-only** — it can read the session cookie but does not need to set cookies (the middleware already handles refreshes).

### 3. `app/api/v1/[...path]/route.ts` — Proxy

```
Browser request:  GET /api/v1/tickets
                         │
                         ▼
            app/api/v1/[...path]/route.ts
                         │
              ┌──────────┴──────────┐
              │  1. Read session     │
              │     from cookie      │
              │  2. Extract JWT      │
              │  3. Forward to       │
              │     Railway with     │
              │     Bearer token     │
              └──────────┬──────────┘
                         │
                         ▼
              GET https://railway.app/api/v1/tickets
              Authorization: Bearer <jwt>
                         │
                         ▼
              Railway verifies JWT, returns data
                         │
                         ▼
              NextResponse.json(data)  ← back to browser
```

The `[...path]` catch-all captures any path after `/api/v1/`:

| Browser calls          | Path segments      | Railway URL                          |
|------------------------|--------------------|--------------------------------------|
| `/api/v1/tickets`      | `['tickets']`      | `railway.app/api/v1/tickets`         |
| `/api/v1/tickets/abc`  | `['tickets','abc']`| `railway.app/api/v1/tickets/abc`     |
| `/api/v1/proposals/x/feedback` | `['proposals','x','feedback']` | `railway.app/api/v1/proposals/x/feedback` |

---

## JWT Verification on Railway

Railway never changes — it still verifies every token. The only difference is the token now arrives from Next.js server, not the browser.

```
FastAPI get_current_user()
          │
          ▼
    Read Authorization header
          │
          ▼
    jwt.get_unverified_header(token)
          │
          ├── alg = ES256 ──► fetch matching key from JWKS cache
          │                   jwt.decode(token, public_key, ["ES256"])
          │
          └── alg = HS256 ──► jwt.decode(token, JWT_SECRET, ["HS256"])
                               (legacy fallback)
          │
          ▼
    payload stored in request.state.user
    (sub = user UUID, email, role = "authenticated")
```

JWKS keys are fetched once at startup from:
```
https://<project>.supabase.co/auth/v1/.well-known/jwks.json
```

---

## CORS: No Longer Needed for the Browser

```
Before:                              After:

Browser ──────► Railway              Browser ──────► Vercel (same origin)
(cross-origin)                       (same origin)
                                                     Vercel ──────► Railway
CORS headers required:               (server-to-server, no CORS needed)
- Access-Control-Allow-Origin
- Access-Control-Allow-Headers       CORS_ORIGINS on Railway = localhost:3000
- Preflight OPTIONS requests         (dev only, browser never hits Railway)
```

CORS is still configured on Railway for local development convenience, but it's no longer functionally required for production.

---

## Environment Variables

| Variable | Where | Visible to browser? | Purpose |
|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Vercel + local | Yes | Supabase project URL for browser client |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel + local | Yes | Supabase anon key (safe to expose) |
| `API_BACKEND_URL` | Vercel + local | **No** | Backend API base URL — server-only |
| `SUPABASE_JWT_SECRET` | Railway | No | JWT verification (HS256 legacy) |
| `DATABASE_URL` | Railway | No | Postgres connection string |
| `CORS_ORIGINS` | Railway | No | Allowed origins (localhost only now) |
