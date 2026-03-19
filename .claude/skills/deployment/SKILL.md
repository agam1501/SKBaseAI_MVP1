---
name: skbaseai-deployment
description: Railway (backend) and Vercel (frontend) deployment config, all environment variables, local dev setup, and the enrichment kill switch for SKBaseAI. Use when deploying, configuring env vars, setting up a local environment, or toggling the enrichment pipeline.
---

# Deployment

## Backend → Railway

**Project**: adventurous-fascination
**URL**: https://adventurous-fascination-production.up.railway.app
**Config**: `apps/api/railway.toml`

### Environment Variables (Railway Dashboard)

| Variable | Value / Notes |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres.<ref>:<password>@aws-0-us-west-2.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | from Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API |
| `SUPABASE_JWT_SECRET` | from Supabase → Settings → API → Legacy JWT Secret |
| `DEFAULT_CLIENT_ID` | `00000000-0000-0000-0000-000000000001` |
| `CORS_ORIGINS` | Vercel production URL (comma-separated if multiple) |
| `ENABLE_ENRICHMENT` | `false` — set explicitly; Pydantic defaults to `true` if unset. Flip to `true` only when Redis + ARQ worker are running. |
| `REDIS_URL` | Redis connection string — only needed when ARQ worker is deployed |
| `OPENAI_API_KEY` | Required when enrichment is enabled |
| `SITE_URL` | `https://skbasemvp.vercel.app` — base URL used as `redirect_to` in invite emails |

> **Important**: `ENABLE_ENRICHMENT` is read by Pydantic settings at startup from this env var. Setting it to `false` in Railway and redeploying disables enrichment with no code change needed.

### Deploy

Deploy by merging to `main`. Railway auto-deploys via GitHub integration.
Never use `railway up` — it bypasses the integration, creates untracked deployments,
and may not pick up env vars correctly.

To force a redeploy without a code change: Railway dashboard → Deployments → Redeploy.

### ARQ Worker (future — when enrichment branch is merged)
The worker runs as a **separate Railway service** pointing at the same repo:
- Start command: `arq apps/api/worker.WorkerSettings`
- Needs: `REDIS_URL`, `DATABASE_URL`, `OPENAI_API_KEY`
- Add `REDIS_URL` to the API service too so it can enqueue jobs

---

## Frontend → Vercel

**Project**: web (agam1501s-projects)
**URL**: https://web-three-ebon-27.vercel.app
**Config**: `apps/web/vercel.json`

### Environment Variables (Vercel Dashboard or CLI)

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from Supabase → Settings → API |
| `RAILWAY_API_URL` | Backend API base URL — server-only, used by BFF proxy |

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production --value "..."
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --value "..."
vercel env add RAILWAY_API_URL production --value "https://...railway.app"
```

### Deploy
```bash
cd apps/web
vercel --prod --yes
```

---

## Local Development

### Backend
```bash
cd apps/api
python -m venv .venv && .venv/bin/pip install -e .
.venv/bin/uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Frontend
```bash
cd apps/web
npm install
npm run dev   # uses dotenv -e ../../.env -- next dev
# Runs on http://localhost:3000
```

Both servers must run simultaneously for full-stack local testing.

### ARQ Worker (local, when enrichment branch is active)
```bash
cd apps/api
.venv/bin/arq worker.WorkerSettings
# Requires: redis-server running + REDIS_URL in .env
```

### Root .env (source of truth for local)
```
DATABASE_URL=postgresql+asyncpg://...
SUPABASE_URL=https://...
SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
SUPABASE_JWT_SECRET=...
NEXT_PUBLIC_SUPABASE_URL=https://...
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
RAILWAY_API_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000
DEFAULT_CLIENT_ID=00000000-0000-0000-0000-000000000001
ENABLE_ENRICHMENT=false
OPENAI_API_KEY=sk-...   (only needed when enrichment is on)
REDIS_URL=redis://localhost:6379/0   (only needed when worker is running)
```
