# Database — Supabase (Postgres + pgvector)

## Project
- **Project ref**: `dlzrsfizxchymvbchkxa`
- **Region**: West US (Oregon) — `aws-0-us-west-2`
- **Extensions**: `pgvector` (vector similarity search)

## Connection
Use **Transaction Mode pooler** (port 6543) for async SQLAlchemy:
```
postgresql+asyncpg://postgres.<ref>:<password>@aws-0-us-west-2.pooler.supabase.com:6543/postgres
```
Never use port 5432 (Session Mode) with NullPool — it won't work with multiple workers.

## Tables

### tickets
Core ticket data ingested from source systems.

| Column | Type | Notes |
|---|---|---|
| ticket_id | uuid PK | |
| client_id | uuid | tenant identifier |
| external_id | text | source system ID |
| short_desc | text | required |
| full_desc | text | full ticket body |
| cleaned_text | text | pre-processed for embedding |
| resolution | text | how it was resolved |
| root_cause | text | |
| status | enum | `OPEN` or `CLOSED` |
| priority | text | |
| is_resolved | bool | gates vector search candidates |
| created_at / updated_at | timestamptz | |

### ticket_embeddings
Vector embeddings of ticket text chunks.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK → tickets | |
| embedding | vector(1536) | text-embedding-3-small |
| chunk_index | int | position in chunked text |
| chunk_text | text | the chunk that was embedded |
| embedding_model | text | model used |

### ticket_taxonomies
LLM-extracted classification of tickets.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK → tickets | |
| l1 / l2 / l3 | text | 3-level taxonomy hierarchy |
| confidence_score | float | |
| is_active | bool | set to false on re-enrichment (audit trail) |
| taxonomy_assigned_at | timestamptz | when LLM assigned the taxonomy |

### ticket_proposals
AI-generated resolution proposals.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| ticket_id | uuid FK → tickets | |
| proposal_narrative | text | the generated proposal text |
| similar_ticket_ids | uuid[] | array of ticket_ids used as context |
| is_latest | bool | only one true per ticket at a time |
| llm_model_used | text | |
| proposal_created_at | timestamptz | when the LLM generated this proposal |

### ticket_proposal_feedback
Human feedback on proposals.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| proposal_id | uuid FK → ticket_proposals | |
| ticket_id | uuid | denormalised for easier querying |
| accepted | bool | |
| reason_if_rejected | text | |
| modified_narrative | text | user-edited version |
| user_id | uuid | Supabase auth user |
| feedback_created_at | timestamptz | when feedback was submitted |

## Vector Search Pattern (Phase 2)
```sql
SELECT t.ticket_id, t.short_desc, t.resolution,
       1 - (te.embedding <=> CAST(:qvec AS vector)) AS similarity
FROM ticket_embeddings te
JOIN tickets t ON t.ticket_id = te.ticket_id
WHERE te.client_id = :client_id
  AND t.is_resolved = TRUE
  AND 1 - (te.embedding <=> CAST(:qvec AS vector)) >= 0.65
ORDER BY te.embedding <=> CAST(:qvec AS vector)
LIMIT 5
```

## Auth
- Supabase email/password auth enabled
- JWT signing: **ECC P-256 (ES256)** — not legacy HS256
- JWT secret (legacy) stored in `SUPABASE_JWT_SECRET` env var for reference
