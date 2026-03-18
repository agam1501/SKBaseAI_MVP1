---
name: skbaseai-overview
description: High-level system architecture, services, request flow, and phase status for SKBaseAI. Use when understanding how the system fits together, what phase a feature belongs to, or which service handles what.
---

# SKBaseAI — System Overview

## What It Does
AI-powered IT ticket resolution. Ingests support tickets, enriches them with embeddings + LLM-extracted taxonomies, and generates resolution proposals by finding similar resolved tickets via vector search.

## Services

| Service | Tech | Hosted On |
|---|---|---|
| Frontend | Next.js 14 | Vercel |
| Backend API | FastAPI (Python) | Railway |
| Database | Supabase (Postgres + pgvector) | Supabase |
| Job Queue | ARQ + Redis | Railway (Phase 3) |

## Request Flow

```
Browser
  → Vercel (Next.js)
    → Supabase Auth       (login / JWT issued as HTTP-only cookie)
    → Next.js middleware  (cookie refresh + auth guard on every request)
    → Next.js /api/v1/*  (BFF proxy — reads cookie, forwards JWT to Railway)
      → Railway (FastAPI)  (JWT verified server-to-server, DB queried)
        → Supabase Postgres  (data read/write)
        → Redis / ARQ Worker  (async enrichment — Phase 3)
          → OpenAI API  (embeddings + LLM — Phase 3)
```

> Browser never calls Railway directly. See `.claude/skills/auth-bff/SKILL.md` for the full auth and proxy flow.

## Phase Status

| Phase | Description | Status |
|---|---|---|
| 1 | Infrastructure skeleton (auth, backend, frontend, deploy) | ✅ Done |
| 2 | Enrichment pipeline (embeddings, taxonomy, proposals) | 🔜 Next |
| 3 | Worker / queue (ARQ + Redis) | 🔜 Later |

## Key Technical Decisions

- **NullPool + asyncpg port 6543**: Supabase Transaction Mode pooler. Supavisor manages connections externally; `statement_cache_size=0` avoids prepared statement conflicts.
- **ES256 JWT verification**: Supabase now signs tokens with ECC (P-256). Backend fetches public keys from Supabase JWKS endpoint on startup.
- **ARQ over Celery**: Fully async worker for OpenAI calls; supports task chaining via `ctx["redis"]`.
- **is_active=False for taxonomy overwrites**: Preserves audit trail without deletes.
