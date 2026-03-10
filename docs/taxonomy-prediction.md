# Taxonomy Prediction — LLM-Powered Classification

## Overview

When tickets are ingested, the system automatically classifies them across 4 taxonomy dimensions using OpenAI's `gpt-4o-mini` with structured output. Each dimension is predicted independently using a **cascading L1 → L2 → L3** approach that narrows options at each level.

## Taxonomy Types

| Type | Description | Reference Table | L1 Column | L2 Column | L3 Column | Node Column |
|---|---|---|---|---|---|---|
| Business Category | What business area the ticket belongs to | `taxonomy_business_category` | `l1` | `l2` | `l3` | `node` |
| Application | Which application/system is affected | `taxonomy_application` | `l1` | `l2` | `l3` | `node_id` |
| Resolution | How the ticket was resolved | `taxonomy_resolution` | `l1_outcome` | `l2_action_type` | `l3_resolution_code` | `resolution_code` |
| Root Cause | Why the issue occurred | `taxonomy_root_cause` | `l1_cause_domain` | `l2_cause_type` | `l3_root_cause` | `root_cause_code_id` |

Each taxonomy type has a reference table in Supabase with pre-loaded hierarchical options. Rows can be global (`client_id IS NULL`) or client-specific.

## Architecture

### Cascading Narrowing Strategy

Instead of asking the LLM to pick from hundreds of options at once, we narrow progressively:

```
Step 1: Pick L1 from ALL distinct L1 values       (e.g., 5-10 options)
Step 2: Pick L2 from L2s under selected L1         (e.g., 3-8 options)
Step 3: Pick L3 from L3s under selected L1 + L2    (e.g., 2-5 options)
```

This means each LLM call has a small, focused option set — improving accuracy and keeping token usage low.

### Parallel Execution

The 4 taxonomy types run **in parallel** via `asyncio.gather`. Within each type, the 3 levels run **sequentially** (L2 depends on L1, L3 depends on L2).

```
Wall-clock time: ~3 sequential LLM calls (not 12)

         ┌── business_category: L1 → L2 → L3 ──┐
Ticket → ├── application:       L1 → L2 → L3 ──├→ 4 TicketTaxonomy rows
         ├── resolution:        L1 → L2 → L3 ──┤
         └── root_cause:        L1 → L2 → L3 ──┘
                    (all 4 run in parallel)
```

### Dynamic Enum Constraint (Structured Output)

Each LLM call uses OpenAI's `response_format: json_schema` with `strict: true`. The `selected_value` field's enum is set dynamically to the exact list of valid values from the DB:

```json
{
  "type": "json_schema",
  "json_schema": {
    "name": "taxonomy_prediction",
    "strict": true,
    "schema": {
      "type": "object",
      "properties": {
        "selected_value": { "type": "string", "enum": ["Hardware", "Software", "Network"] },
        "confidence": { "type": "number" },
        "reasoning": { "type": "string" }
      },
      "required": ["selected_value", "confidence", "reasoning"],
      "additionalProperties": false
    }
  }
}
```

This means the model **physically cannot return an invalid value** — no validation or retry logic needed.

## File Structure

```
apps/api/services/
├── llm.py                  # Entry point: extract_taxonomies() delegates to TaxonomyPredictor
└── taxonomy_predictor.py   # Core prediction logic

apps/api/tests/
├── conftest.py             # Adds apps/api/ to sys.path
└── test_taxonomy_predictor.py  # 19 unit tests (mocked OpenAI + DB)
```

## Key Classes and Methods

### `TaxonomyTypeConfig` (dataclass)
Maps each taxonomy type to its DB column names, model class, context columns, and human-readable label. Defined as `TAXONOMY_CONFIGS` list (4 entries).

### `TaxonomyPredictor`

| Method | Description |
|---|---|
| `predict_for_ticket(db, ticket)` | Main entry point. Runs all 4 taxonomy types in parallel. Returns `list[TicketTaxonomy]`. |
| `_build_ticket_text(ticket)` | Combines `short_desc`, `full_desc`, `cleaned_text`, `resolution`, `root_cause` into prompt text. |
| `_predict_single_taxonomy(db, ticket, text, config)` | Cascades through L1 → L2 → L3 for one taxonomy type. |
| `_get_level_options(db, config, level, client_id, filters)` | Queries reference table for distinct values at a level, filtered by parent levels and client. |
| `_predict_level(text, config, level, options, prior)` | Single LLM call with dynamic enum constraint. |
| `_build_prediction_schema(valid_values)` | Builds JSON schema with enum set to valid DB values. |
| `_format_options_for_prompt(options, config)` | Formats options with context fields (definitions, examples, keywords) as a numbered list. |
| `_resolve_node(db, config, client_id, l1, l2, l3)` | Looks up the node identifier for a final L1/L2/L3 combination. |

## LLM Prompting Details

### Ticket Text
All available fields are combined:
```
Summary: <short_desc>
Description: <full_desc>
Cleaned Text: <cleaned_text>    (if available)
Resolution: <resolution>        (if available)
Root Cause: <root_cause>         (if available)
```

### System Prompts
Three level-specific system prompts guide the LLM:
- **L1**: "Select the most appropriate top-level category from the provided options."
- **L2**: "A top-level category (L1) has already been determined. Select the most appropriate subcategory."
- **L3**: "Both L1 and L2 have been determined. Select the most specific classification."

### User Prompt Structure
```
## Ticket
<ticket text>

## Already Classified          (for L2/L3 only)
- L1 (Business Category): Hardware
- L2 (Business Category): Laptop Issues    (for L3 only)

## Task
Select the best L2 (subcategory) for the Business Category taxonomy.

## Options
1. **Laptop Issues**  (label: Physical laptop hardware; keywords: laptop, screen, keyboard)
2. **Desktop Issues**  (label: Desktop hardware; keywords: tower, monitor)
```

### Context Columns per Taxonomy Type
Each option can include additional context fields to help the LLM decide:

| Taxonomy Type | Context Fields |
|---|---|
| Business Category | `label`, `keywords` |
| Application | `label`, `software_vendor`, `product_name`, `keywords`, `description` |
| Resolution | `definition`, `examples`, `usage_guidance` |
| Root Cause | `definition`, `examples`, `usage_guidance` |

### Temperature
Set to `1` — OpenAI recommends this when using structured output with enum constraints. The enum constraint already limits the output space, so temperature only affects the distribution over valid options.

## Client Filtering

Reference table queries filter by: `WHERE is_active = true AND (client_id IS NULL OR client_id = :client_id)`

This returns both global taxonomy entries and client-specific ones. The same filter is applied at each level (L1, L2, L3) and when resolving the final node identifier.

## Error Handling

| Scenario | Behavior |
|---|---|
| LLM API failure for one taxonomy type | Other 3 types still succeed (`asyncio.gather(return_exceptions=True)`) |
| No reference data at any level | That taxonomy type is skipped with a warning log |
| All 4 types fail | Returns empty list (no crash) |
| Invalid LLM output | Not possible with dynamic enum + strict mode |

## Output

Each successful prediction creates a `TicketTaxonomy` row:

| Field | Value |
|---|---|
| `taxonomy_type` | e.g. `"business_category"` |
| `l1`, `l2`, `l3` | Predicted values |
| `node` | Looked up from reference table |
| `confidence_score` | Average of L1, L2, L3 confidences (0-1) |
| `source` | `"llm"` |
| `is_active` | `true` |

## Configuration

| Setting | Location | Default |
|---|---|---|
| `OPENAI_API_KEY` | `.env` / Railway env vars | (required) |
| `LLM_MODEL` | `config.py` | `gpt-4o-mini` |

The OpenAI API key must be set in Railway for production. It is **not** needed in Vercel (frontend doesn't call OpenAI).

## Testing

### Unit Tests
19 tests in `apps/api/tests/test_taxonomy_predictor.py` covering:
- `_build_ticket_text`: all fields, single field, empty ticket
- `_build_prediction_schema`: schema structure, single option
- `_format_options_for_prompt`: with context, without context
- `_predict_level`: correct OpenAI params, prior predictions in prompt
- `_predict_single_taxonomy`: full cascade flow, no L1/L2 options → returns None
- `predict_for_ticket`: all 4 types, partial failure, all failures, None results skipped
- `TAXONOMY_CONFIGS`: all 4 types defined, correct column mappings

Run tests:
```bash
cd apps/api
.venv/bin/python -m pytest tests/test_taxonomy_predictor.py -v
```

### Integration Testing
For end-to-end testing against real OpenAI + Supabase, use the standalone script `apps/api/test_predictor.py` (not committed — requires `OPENAI_API_KEY` in `.env`).
