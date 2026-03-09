"""Taxonomy prediction using cascading L1 → L2 → L3 classification with OpenAI structured output."""

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone

from openai import AsyncOpenAI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config import settings
from models import (
    TaxonomyApplication,
    TaxonomyBusinessCategory,
    TaxonomyResolution,
    TaxonomyRootCause,
    Ticket,
    TicketTaxonomy,
)

logger = logging.getLogger(__name__)


@dataclass
class TaxonomyTypeConfig:
    """Maps a taxonomy type to its reference table structure."""

    taxonomy_type: str  # e.g. "business_category"
    model_class: type  # SQLAlchemy model for reference table
    l1_col: str  # column name for L1
    l2_col: str  # column name for L2
    l3_col: str  # column name for L3
    node_col: str  # column name for node identifier
    context_cols: list[str] = field(default_factory=list)  # extra columns for LLM context
    type_label: str = ""  # human-readable label for prompts


TAXONOMY_CONFIGS = [
    TaxonomyTypeConfig(
        taxonomy_type="business_category",
        model_class=TaxonomyBusinessCategory,
        l1_col="l1",
        l2_col="l2",
        l3_col="l3",
        node_col="node",
        context_cols=["label", "keywords"],
        type_label="Business Category",
    ),
    TaxonomyTypeConfig(
        taxonomy_type="application",
        model_class=TaxonomyApplication,
        l1_col="l1",
        l2_col="l2",
        l3_col="l3",
        node_col="node_id",
        context_cols=["label", "software_vendor", "product_name", "keywords", "description"],
        type_label="Application",
    ),
    TaxonomyTypeConfig(
        taxonomy_type="resolution",
        model_class=TaxonomyResolution,
        l1_col="l1_outcome",
        l2_col="l2_action_type",
        l3_col="l3_resolution_code",
        node_col="resolution_code",
        context_cols=["definition", "examples", "usage_guidance"],
        type_label="Resolution",
    ),
    TaxonomyTypeConfig(
        taxonomy_type="root_cause",
        model_class=TaxonomyRootCause,
        l1_col="l1_cause_domain",
        l2_col="l2_cause_type",
        l3_col="l3_root_cause",
        node_col="root_cause_code_id",
        context_cols=["definition", "examples", "usage_guidance"],
        type_label="Root Cause",
    ),
]

SYSTEM_PROMPTS = {
    "l1": (
        "You are a taxonomy classification expert for IT service management tickets. "
        "Given a ticket, select the most appropriate top-level category (L1) from the provided options. "
        "Consider the overall domain and scope of the issue described."
    ),
    "l2": (
        "You are a taxonomy classification expert for IT service management tickets. "
        "A top-level category (L1) has already been determined. "
        "Given the ticket and the selected L1 category, select the most appropriate subcategory (L2) from the provided options. "
        "Focus on narrowing the classification within the given L1 category."
    ),
    "l3": (
        "You are a taxonomy classification expert for IT service management tickets. "
        "Both the top-level category (L1) and subcategory (L2) have been determined. "
        "Given the ticket and the selected L1/L2 categories, select the most specific classification (L3) from the provided options. "
        "Choose the most precise match for this ticket."
    ),
}


class TaxonomyPredictor:
    """Predicts L1/L2/L3 taxonomy classifications for tickets using cascading LLM calls."""

    def __init__(self, client: AsyncOpenAI | None = None):
        from services.llm import get_client

        self._client = client or get_client()
        self._model = settings.llm_model

    async def predict_for_ticket(self, db: AsyncSession, ticket: Ticket) -> list[TicketTaxonomy]:
        """Predict all 4 taxonomy types for a ticket. Runs types in parallel."""
        ticket_text = self._build_ticket_text(ticket)

        results = await asyncio.gather(
            *[
                self._predict_single_taxonomy(db, ticket, ticket_text, config)
                for config in TAXONOMY_CONFIGS
            ],
            return_exceptions=True,
        )

        taxonomies: list[TicketTaxonomy] = []
        for config, result in zip(TAXONOMY_CONFIGS, results):
            if isinstance(result, Exception):
                logger.error(
                    "Failed to predict %s for ticket %s: %s",
                    config.taxonomy_type,
                    ticket.ticket_id,
                    result,
                )
            elif result is not None:
                taxonomies.append(result)

        return taxonomies

    def _build_ticket_text(self, ticket: Ticket) -> str:
        """Combine ticket fields into a single text block for the LLM."""
        parts: list[str] = []
        if ticket.short_desc:
            parts.append(f"Summary: {ticket.short_desc}")
        if ticket.full_desc:
            parts.append(f"Description: {ticket.full_desc}")
        if ticket.cleaned_text:
            parts.append(f"Cleaned Text: {ticket.cleaned_text}")
        if ticket.resolution:
            parts.append(f"Resolution: {ticket.resolution}")
        if ticket.root_cause:
            parts.append(f"Root Cause: {ticket.root_cause}")
        return "\n\n".join(parts) if parts else ticket.short_desc or ""

    async def _predict_single_taxonomy(
        self,
        db: AsyncSession,
        ticket: Ticket,
        ticket_text: str,
        config: TaxonomyTypeConfig,
    ) -> TicketTaxonomy | None:
        """Cascade through L1 → L2 → L3 for a single taxonomy type."""
        client_id = ticket.client_id

        # --- L1 ---
        l1_options = await self._get_level_options(db, config, "l1", client_id, {})
        if not l1_options:
            logger.warning("No L1 options for %s — skipping", config.taxonomy_type)
            return None

        l1_result = await self._predict_level(ticket_text, config, "l1", l1_options, {})
        l1_value = l1_result["selected_value"]

        # --- L2 ---
        l2_options = await self._get_level_options(db, config, "l2", client_id, {"l1": l1_value})
        if not l2_options:
            logger.warning(
                "No L2 options for %s under L1=%s — skipping", config.taxonomy_type, l1_value
            )
            return None

        l2_result = await self._predict_level(
            ticket_text, config, "l2", l2_options, {"l1": l1_value}
        )
        l2_value = l2_result["selected_value"]

        # --- L3 ---
        l3_options = await self._get_level_options(
            db, config, "l3", client_id, {"l1": l1_value, "l2": l2_value}
        )
        if not l3_options:
            logger.warning(
                "No L3 options for %s under L1=%s/L2=%s — skipping",
                config.taxonomy_type,
                l1_value,
                l2_value,
            )
            return None

        l3_result = await self._predict_level(
            ticket_text, config, "l3", l3_options, {"l1": l1_value, "l2": l2_value}
        )
        l3_value = l3_result["selected_value"]

        # Average confidence across the 3 levels
        avg_confidence = (
            l1_result["confidence"] + l2_result["confidence"] + l3_result["confidence"]
        ) / 3.0

        # Resolve node identifier
        node = await self._resolve_node(db, config, client_id, l1_value, l2_value, l3_value)

        return TicketTaxonomy(
            id=uuid.uuid4(),
            ticket_id=ticket.ticket_id,
            client_id=client_id,
            taxonomy_type=config.taxonomy_type,
            l1=l1_value,
            l2=l2_value,
            l3=l3_value,
            node=node,
            confidence_score=round(avg_confidence, 4),
            source="llm",
            is_active=True,
            taxonomy_assigned_at=datetime.now(timezone.utc),
        )

    async def _get_level_options(
        self,
        db: AsyncSession,
        config: TaxonomyTypeConfig,
        level: str,  # "l1", "l2", or "l3"
        client_id: uuid.UUID,
        filters: dict[str, str],
    ) -> list[dict]:
        """Query reference table for distinct values at the given level, filtered by parents and client."""
        model = config.model_class
        col_map = {"l1": config.l1_col, "l2": config.l2_col, "l3": config.l3_col}
        target_col = col_map[level]

        # Select the target column plus context columns
        columns = [getattr(model, target_col)]
        for ctx_col in config.context_cols:
            if hasattr(model, ctx_col):
                columns.append(getattr(model, ctx_col))

        stmt = select(*columns).where(model.is_active == True)  # noqa: E712

        # Client filter: global (NULL) or matching client
        from sqlalchemy import or_

        stmt = stmt.where(or_(model.client_id.is_(None), model.client_id == client_id))

        # Parent level filters
        if "l1" in filters:
            stmt = stmt.where(getattr(model, config.l1_col) == filters["l1"])
        if "l2" in filters:
            stmt = stmt.where(getattr(model, config.l2_col) == filters["l2"])

        # Distinct on target column
        stmt = stmt.distinct(getattr(model, target_col))

        result = await db.execute(stmt)
        rows = result.all()

        options: list[dict] = []
        seen_values: set[str] = set()
        for row in rows:
            value = row[0]
            if value in seen_values:
                continue
            seen_values.add(value)
            option: dict = {"value": value}
            for i, ctx_col in enumerate(config.context_cols):
                if hasattr(model, ctx_col) and i + 1 < len(row):
                    ctx_val = row[i + 1]
                    if ctx_val is not None:
                        # Convert JSONB to string if needed
                        if isinstance(ctx_val, (dict, list)):
                            ctx_val = json.dumps(ctx_val)
                        option[ctx_col] = str(ctx_val)
            options.append(option)

        return options

    async def _predict_level(
        self,
        ticket_text: str,
        config: TaxonomyTypeConfig,
        level: str,
        options: list[dict],
        prior_predictions: dict[str, str],
    ) -> dict:
        """Make a single LLM call with dynamic enum to predict one level."""
        valid_values = [opt["value"] for opt in options]
        schema = self._build_prediction_schema(valid_values)

        # Build user prompt
        user_prompt_parts: list[str] = [f"## Ticket\n{ticket_text}"]

        if prior_predictions:
            context_lines = []
            if "l1" in prior_predictions:
                context_lines.append(f"- L1 ({config.type_label}): {prior_predictions['l1']}")
            if "l2" in prior_predictions:
                context_lines.append(f"- L2 ({config.type_label}): {prior_predictions['l2']}")
            user_prompt_parts.append("## Already Classified\n" + "\n".join(context_lines))

        options_text = self._format_options_for_prompt(options, config)
        level_label = {
            "l1": "L1 (top-level category)",
            "l2": "L2 (subcategory)",
            "l3": "L3 (specific classification)",
        }[level]
        user_prompt_parts.append(
            f"## Task\nSelect the best {level_label} for the {config.type_label} taxonomy.\n\n"
            f"## Options\n{options_text}"
        )

        user_prompt = "\n\n".join(user_prompt_parts)

        response = await self._client.chat.completions.create(
            model=self._model,
            temperature=1,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPTS[level]},
                {"role": "user", "content": user_prompt},
            ],
            response_format={
                "type": "json_schema",
                "json_schema": {
                    "name": "taxonomy_prediction",
                    "strict": True,
                    "schema": schema,
                },
            },
        )

        content = response.choices[0].message.content
        parsed = json.loads(content)
        return parsed

    def _build_prediction_schema(self, valid_values: list[str]) -> dict:
        """Build JSON schema with dynamic enum constraint."""
        return {
            "type": "object",
            "properties": {
                "selected_value": {"type": "string", "enum": valid_values},
                "confidence": {"type": "number"},
                "reasoning": {"type": "string"},
            },
            "required": ["selected_value", "confidence", "reasoning"],
            "additionalProperties": False,
        }

    def _format_options_for_prompt(self, options: list[dict], config: TaxonomyTypeConfig) -> str:
        """Format options with context fields into a numbered list for the prompt."""
        lines: list[str] = []
        for i, opt in enumerate(options, 1):
            parts = [f"{i}. **{opt['value']}**"]
            context_parts: list[str] = []
            for ctx_col in config.context_cols:
                if ctx_col in opt and opt[ctx_col]:
                    context_parts.append(f"{ctx_col}: {opt[ctx_col]}")
            if context_parts:
                parts.append(f"  ({'; '.join(context_parts)})")
            lines.append("".join(parts))
        return "\n".join(lines)

    async def _resolve_node(
        self,
        db: AsyncSession,
        config: TaxonomyTypeConfig,
        client_id: uuid.UUID,
        l1: str,
        l2: str,
        l3: str,
    ) -> str | None:
        """Look up the node identifier for a specific L1/L2/L3 combination."""
        model = config.model_class
        from sqlalchemy import or_

        stmt = (
            select(getattr(model, config.node_col))
            .where(
                getattr(model, config.l1_col) == l1,
                getattr(model, config.l2_col) == l2,
                getattr(model, config.l3_col) == l3,
                model.is_active == True,  # noqa: E712
                or_(model.client_id.is_(None), model.client_id == client_id),
            )
            .limit(1)
        )
        result = await db.execute(stmt)
        row = result.scalar_one_or_none()
        return row
