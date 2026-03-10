# Deployment

## Backend → Railway

**Project**: adventurous-fascination
**URL**: https://adventurous-fascination-production.up.railway.app
**Config**: `apps/api/railway.toml`

### Environment Variables (Railway Dashboard)
| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://postgres.<ref>:<password>@aws-0-us-west-2.pooler.supabase.com:6543/postgres` |
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | from Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | from Supabase → Settings → API |
| `SUPABASE_JWT_SECRET` | from Supabase → Settings → API → Legacy JWT Secret |
| `DEFAULT_CLIENT_ID` | `00000000-0000-0000-0000-000000000001` |
| `OPENAI_API_KEY` | from OpenAI → API Keys (required for taxonomy prediction) |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` (Railway reference variable from Redis plugin) |
| `CORS_ORIGINS` | Vercel production URL (comma-separated if multiple) |

### Worker Service

Same codebase as API, different start command. Root directory: `apps/api`.

**Start command**: `arq worker.WorkerSettings`

**Environment Variables**: Same as API service — use Railway reference variables to stay in sync (e.g. `${{adventurous-fascination.DATABASE_URL}}`).

See [docs/enrichment-pipeline.md](./enrichment-pipeline.md) for full architecture details.

### Deploy
```bash
cd apps/api
railway up --detach
```

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
| `RAILWAY_API_URL` | Backend API base URL (e.g. Railway) — server-only, used by BFF proxy |

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

### Redis (for enrichment pipeline)
```bash
docker run -p 6379:6379 redis
```

### Backend
```bash
cd apps/api
.venv/bin/uvicorn main:app --reload
# Runs on http://localhost:8000
```

### Worker (for enrichment pipeline)
```bash
cd apps/api
.venv/bin/arq worker.WorkerSettings
```

### Frontend
```bash
cd apps/web
npm run dev
# Runs on http://localhost:3000
# Loads vars from root .env via dotenv-cli
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
OPENAI_API_KEY=sk-...           # Required for taxonomy prediction (backend only)
REDIS_URL=redis://localhost:6379/0  # Default; no change needed for local Redis
```
