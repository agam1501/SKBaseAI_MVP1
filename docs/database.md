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

### clients
Tenant/organization that owns tickets. Users are linked to clients via `user_clients`.

| Column | Type | Notes |
|---|---|---|
| client_id | uuid PK | |
| name | text | display name |

### user_clients
Which clients a user (Supabase auth user id = JWT `sub`) can access.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK | Supabase auth user id |
| client_id | uuid PK FK → clients | |

To create when missing:
```sql
CREATE TABLE IF NOT EXISTS clients (
  client_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL
);
CREATE TABLE IF NOT EXISTS user_clients (
  user_id uuid NOT NULL,
  client_id uuid NOT NULL REFERENCES clients(client_id),
  PRIMARY KEY (user_id, client_id)
);
-- Optional: insert default client and link a user to it
INSERT INTO clients (client_id, name) VALUES ('00000000-0000-0000-0000-000000000001'::uuid, 'Default')
ON CONFLICT (client_id) DO NOTHING;
```

### user_roles
Global role per user (Admin, Responder, Developer). A user has exactly one role regardless of which client they access.

| Column | Type | Notes |
|---|---|---|
| user_id | uuid PK | Supabase auth user id |
| role | user_role_enum | `Admin`, `Responder`, or `Developer` |

```sql
CREATE TYPE user_role_enum AS ENUM ('Admin', 'Responder', 'Developer');

CREATE TABLE IF NOT EXISTS user_roles (
    user_id uuid PRIMARY KEY,
    role    user_role_enum NOT NULL
);
```

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
LLM-extracted classification of tickets (assignments linking tickets to taxonomy reference tables).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| client_id | uuid | tenant |
| ticket_id | uuid FK → tickets | |
| taxonomy_type | text | e.g. `business_category`, `application`, `resolution`, `root_cause` |
| l1 / l2 / l3 | text | 3-level taxonomy hierarchy |
| node | text | leaf node / code id from reference table |
| confidence_score | float | |
| source | text | assignment source |
| source_model_version | text | model version if LLM-assigned |
| is_active | bool | set to false on re-enrichment (audit trail) |
| taxonomy_assigned_at | timestamptz | when assigned |
| created_at | timestamptz | |

### taxonomy_business_category
Reference table: L1/L2/L3 business category hierarchy. Optional per-client override via `client_id` (null = global).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| client_id | uuid | null = global |
| l1 | text | top level |
| l2 | text | |
| l3 | text | |
| node | text | unique node identifier |
| label | text | display label |
| parent_node_id | text | parent in hierarchy |
| is_active | bool | default true |
| created_at / updated_at | timestamptz | |
| keywords | text | search/keyword hints |

### taxonomy_application
Reference table: applications/products (L1/L2/L3 + vendor, product, keywords). Optional per-client override.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| client_id | uuid | null = global |
| l1 / l2 / l3 | text | hierarchy |
| node_id | text | unique node identifier |
| label | text | |
| software_vendor | text | |
| product_name | text | |
| keywords | jsonb | array or object of keywords |
| app_group | text | |
| category | text | |
| description | text | |
| is_active | bool | default true |
| created_at / updated_at | timestamptz | |

### taxonomy_resolution
Reference table: resolution outcomes and action types (L1 outcome, L2 action, L3 resolution code).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| client_id | uuid | null = global |
| l1_outcome | text | |
| l2_action_type | text | |
| l3_resolution_code | text | |
| resolution_code | text | primary code |
| resolution_durability | text | |
| definition | text | |
| examples | text | |
| usage_guidance | text | |
| is_active | bool | default true |
| created_at / updated_at | timestamptz | |

### taxonomy_root_cause
Reference table: root cause domains and codes (L1 domain, L2 type, L3 root cause).

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | default gen_random_uuid() |
| client_id | uuid | null = global |
| l1_cause_domain | text | |
| l2_cause_type | text | |
| l3_root_cause | text | |
| root_cause_code_id | text | primary code |
| definition | text | |
| examples | text | |
| usage_guidance | text | |
| default_owner | text | suggested owner |
| preventability | text | |
| change_related | text | |
| is_active | bool | default true |
| created_at / updated_at | timestamptz | |

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
