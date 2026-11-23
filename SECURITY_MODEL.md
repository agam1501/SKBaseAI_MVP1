# SKBaseAI MVP1 — Threat Model

## System overview
AI-assisted IT ticket resolution. Tickets are ingested (single create or CSV upload), enriched with LLM taxonomy predictions (OpenAI), and shown with AI resolution proposals.

Request flow: Browser → Next.js on Vercel (`apps/web`) → BFF proxy `app/api/v1/[...path]/route.ts` (reads Supabase session cookie, forwards `Authorization: Bearer <jwt>` and `X-Client-Id`) → FastAPI on Railway (`apps/api`) → Supabase Postgres (via SQLAlchemy/asyncpg with the DB owner connection string, so Postgres RLS does not protect API queries). Enrichment runs in an ARQ worker on Redis (`apps/api/worker.py`, gated by `ENABLE_ENRICHMENT`).

### Trust boundaries
1. Internet → Vercel (Next.js pages, middleware, BFF proxy).
2. Vercel → Railway API (JWT forwarded server-to-server; the Railway URL is public, so the API is directly reachable with any valid Supabase JWT, bypassing the BFF).
3. API → Supabase Postgres (full DB privileges) and Supabase Auth admin (service-role key).
4. API/worker → OpenAI (ticket text sent in prompts).
5. Tenant boundary: a "client" is a separate customer organization; access is governed by `user_clients` rows.

## Components
| Name | Covers |
|---|---|
| Web | `apps/web/app/**` pages, `components/`, `contexts/`, `lib/` (except below) |
| BFF Proxy | `apps/web/app/api/v1/[...path]/route.ts`, `apps/web/middleware.ts`, `apps/web/lib/supabase*.ts` |
| Auth | JWT verification `apps/api/main.py:get_current_user`, `apps/web/app/login`, `apps/web/app/auth/**`, `apps/api/services/supabase_admin.py` |
| API | `apps/api/routes/**`, `schemas.py`, `models.py`, `db.py`, `config.py` |
| Enrichment | `apps/api/worker.py`, `arq_pool.py`, `services/enrichment.py`, `services/taxonomy_predictor.py`, `services/llm.py`, `services/embeddings.py`, `services/retrieval.py` |
| Infrastructure | `apps/api/railway.toml`, `Procfile`, `apps/web/vercel.json`, `.github/workflows/ci.yml`, `.env.example` |

## Entry points
- Next.js pages; public: `/login`, `/auth/*` (invite callback with implicit-flow tokens in the URL hash, set-password).
- BFF `/api/v1/*` (GET/POST/PATCH/DELETE) — requires a Supabase session cookie, forwards any path and query string.
- FastAPI `/api/v1/*` — all routers require a valid Supabase JWT (ES256 via JWKS or legacy HS256 with `SUPABASE_JWT_SECRET`); `/health` is public.
  - Tenant-scoped via `get_effective_client_id` / `get_optional_client_id` (`X-Client-Id` header checked against `user_clients`; falls back to allowing `client_id == user_id` or `DEFAULT_CLIENT_ID`).
  - Not tenant-scoped in code: `GET /proposals/tickets/{ticket_id}/latest`, `POST /proposals/{proposal_id}/feedback`, `POST /clients/{client_id}/join` (no role or membership check).
  - Role-gated (Admin/Developer from `user_roles`): `POST/PATCH /clients`, `GET /users`, `POST /users/invite`.
  - `POST /tickets/upload` (CSV, size/row capped) and `POST /tickets/{id}/enrich` (triggers OpenAI calls) — no role check.

## Assets (user-ranked: all four are critical)
1. **Ticket contents per client** — may contain customer PII and internal IT details. Cross-client confidentiality and integrity is the user's **top concern**.
2. **Supabase service-role key and Auth admin** — invite users, list all auth users (`list_auth_users` returns every user in the project).
3. **OpenAI API key / spend** — enrichment and per-ticket enrich endpoint.
4. **Integrity of taxonomies and AI proposals** — classifications, proposals, feedback.
Also: `SUPABASE_JWT_SECRET`, `DATABASE_URL`, `REDIS_URL` (Railway env).

## Attacker profiles that matter
- **Authenticated user of another client (tenant)** — the primary attacker (user: cross-client access is the top concern). Any invited user, any role.
- **Outside attacker who self-registers** — the user does not know whether Supabase public sign-up is disabled; the login UI is invite-only but the anon key is public, so treat self-registration as possible. Not ruled out.
- **Low-privilege role (Responder)** escalating to Admin/Developer actions.
- **Unauthenticated internet attacker** against Vercel and the public Railway URL.
- **Malicious ticket content** (CSV upload) — prompt injection into the LLM, stored XSS in the UI.

## Existing controls
- Supabase SSR HTTP-only cookies; middleware `getUser()` guard; BFF keeps JWT out of browser JS.
- JWT verification with algorithm pinned per path and `aud=authenticated`.
- `user_clients` membership checks for most ticket/taxonomy/analytics routes.
- CSV size and row caps; Pydantic validation.
- Railway CORS restricted to localhost (browser never calls Railway directly).

## Out of scope / accepted risk
- User: **nothing is out of scope — report everything.** The MVP gaps listed in `.claude/skills/scaling/SKILL.md` (UI-only role enforcement) are not accepted risk.

## Open questions
- Is Supabase public sign-up disabled? (Determines whether outside attackers can obtain a JWT.)
- Are Postgres RLS policies defined in Supabase? (API uses the owner connection, so they would not apply to API queries.)
- Is the ARQ worker / `ENABLE_ENRICHMENT` live in production?
- No infrastructure repository: Railway, Vercel and Supabase are configured in their dashboards (user).
