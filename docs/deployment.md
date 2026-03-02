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
| `CORS_ORIGINS` | Vercel production URL (comma-separated if multiple) |

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
| `NEXT_PUBLIC_API_URL` | Railway backend URL |

```bash
vercel env add NEXT_PUBLIC_SUPABASE_URL production --value "..."
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY production --value "..."
vercel env add NEXT_PUBLIC_API_URL production --value "..."
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
.venv/bin/uvicorn main:app --reload
# Runs on http://localhost:8000
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
NEXT_PUBLIC_API_URL=http://localhost:8000
CORS_ORIGINS=http://localhost:3000
DEFAULT_CLIENT_ID=00000000-0000-0000-0000-000000000001
```
