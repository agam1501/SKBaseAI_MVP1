# SKBaseAI — System Overview

## What It Does
AI-powered IT ticket resolution. Ingests support tickets, enriches them with embeddings + LLM-extracted taxonomies, and generates resolution proposals by finding similar resolved tickets via vector search.

## Services

| Service | Tech | Hosted On |
|---|---|---|
| Frontend | Next.js 14 | Vercel |
| Backend API | FastAPI (Python) | Railway |
| Database | Supabase (Postgres + pgvector) | Supabase |
| Job Queue | ARQ + Redis | Railway |

## Request Flow

```
Browser
  → Vercel (Next.js)
    → Supabase Auth       (login / JWT issued as HTTP-only cookie)
    → Next.js middleware  (cookie refresh + auth guard on every request)
    → Next.js /api/v1/*  (BFF proxy — reads cookie, forwards JWT to Railway)
      → Railway (FastAPI)  (JWT verified server-to-server, DB queried)
        → Supabase Postgres  (data read/write)
        → Redis / ARQ Worker  (async enrichment)
          → OpenAI API  (taxonomy prediction + future embeddings)
```

> Browser never calls Railway directly. See [docs/bff-auth.md](./bff-auth.md) for the full auth and proxy flow.

## Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Infrastructure skeleton (auth, backend, frontend, deploy) | ✅ Done |
| 2a | Taxonomy prediction (LLM-powered L1/L2/L3 classification) | ✅ Done |
| 2a+ | Enrichment pipeline (ARQ + Redis background processing) | ✅ Done |
| 2b | Embeddings + vector search + proposal generation | 🔜 Next |

## Key Technical Decisions

- **NullPool + asyncpg port 6543**: Supabase Transaction Mode pooler. Supavisor manages connections externally; `statement_cache_size=0` avoids prepared statement conflicts.
- **ES256 JWT verification**: Supabase now signs tokens with ECC (P-256). Backend fetches public keys from Supabase JWKS endpoint on startup.
- **ARQ over Celery**: Fully async worker for OpenAI calls; supports task chaining via `ctx["redis"]`.
- **is_active=False for taxonomy overwrites**: Preserves audit trail without deletes.
- **Cascading taxonomy prediction**: L1 → L2 → L3 narrowing with dynamic enum constraints; 4 types in parallel. See [docs/taxonomy-prediction.md](./taxonomy-prediction.md).
- **Async enrichment pipeline**: ARQ + Redis for background taxonomy prediction on ticket ingestion. See [docs/enrichment-pipeline.md](./enrichment-pipeline.md).
