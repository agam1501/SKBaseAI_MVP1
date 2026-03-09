"""Unit tests for TaxonomyPredictor — mocks OpenAI and DB."""

import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import Ticket, TicketTaxonomy
from services.taxonomy_predictor import TAXONOMY_CONFIGS, TaxonomyPredictor

# --- Fixtures ---


@pytest.fixture
def sample_ticket():
    """A minimal Ticket-like object for testing."""
    ticket = MagicMock(spec=Ticket)
    ticket.ticket_id = uuid.uuid4()
    ticket.client_id = uuid.uuid4()
    ticket.short_desc = "VPN not connecting after Windows update"
    ticket.full_desc = "User reports VPN client fails to establish connection after latest Windows patch."
    ticket.cleaned_text = None
    ticket.resolution = "Reinstalled VPN client and updated network drivers."
    ticket.root_cause = "Windows update broke network adapter configuration."
    return ticket


@pytest.fixture
def biz_cat_config():
    """Business category config for isolated tests."""
    return TAXONOMY_CONFIGS[0]  # business_category


@pytest.fixture
def mock_openai_client():
    """Mock AsyncOpenAI client that returns valid structured responses."""
    client = AsyncMock()
    return client


def _make_llm_response(selected_value: str, confidence: float = 0.85, reasoning: str = "test"):
    """Helper to build a mock OpenAI chat completion response."""
    msg = MagicMock()
    msg.content = json.dumps(
        {"selected_value": selected_value, "confidence": confidence, "reasoning": reasoning}
    )
    choice = MagicMock()
    choice.message = msg
    response = MagicMock()
    response.choices = [choice]
    return response


# --- _build_ticket_text ---


class TestBuildTicketText:
    def test_all_fields(self, sample_ticket, mock_openai_client):
        predictor = TaxonomyPredictor(client=mock_openai_client)
        text = predictor._build_ticket_text(sample_ticket)
        assert "Summary: VPN not connecting" in text
        assert "Description: User reports" in text
        assert "Resolution: Reinstalled" in text
        assert "Root Cause: Windows update" in text
        assert "Cleaned Text" not in text  # cleaned_text is None

    def test_only_short_desc(self, mock_openai_client):
        ticket = MagicMock(spec=Ticket)
        ticket.short_desc = "Login broken"
        ticket.full_desc = None
        ticket.cleaned_text = None
        ticket.resolution = None
        ticket.root_cause = None

        predictor = TaxonomyPredictor(client=mock_openai_client)
        text = predictor._build_ticket_text(ticket)
        assert text == "Summary: Login broken"

    def test_empty_ticket(self, mock_openai_client):
        ticket = MagicMock(spec=Ticket)
        ticket.short_desc = ""
        ticket.full_desc = None
        ticket.cleaned_text = None
        ticket.resolution = None
        ticket.root_cause = None

        predictor = TaxonomyPredictor(client=mock_openai_client)
        text = predictor._build_ticket_text(ticket)
        assert text == ""


# --- _build_prediction_schema ---


class TestBuildPredictionSchema:
    def test_schema_structure(self, mock_openai_client):
        predictor = TaxonomyPredictor(client=mock_openai_client)
        schema = predictor._build_prediction_schema(["Hardware", "Software", "Network"])

        assert schema["type"] == "object"
        assert schema["additionalProperties"] is False
        assert set(schema["required"]) == {"selected_value", "confidence", "reasoning"}
        assert schema["properties"]["selected_value"]["enum"] == [
            "Hardware",
            "Software",
            "Network",
        ]
        assert schema["properties"]["confidence"]["type"] == "number"
        assert schema["properties"]["reasoning"]["type"] == "string"

    def test_single_option(self, mock_openai_client):
        predictor = TaxonomyPredictor(client=mock_openai_client)
        schema = predictor._build_prediction_schema(["OnlyOption"])
        assert schema["properties"]["selected_value"]["enum"] == ["OnlyOption"]


# --- _format_options_for_prompt ---


class TestFormatOptions:
    def test_basic_formatting(self, mock_openai_client, biz_cat_config):
        predictor = TaxonomyPredictor(client=mock_openai_client)
        options = [
            {"value": "Hardware", "label": "Physical devices", "keywords": "laptop, monitor"},
            {"value": "Software"},
        ]
        result = predictor._format_options_for_prompt(options, biz_cat_config)

        assert "1. **Hardware**" in result
        assert "label: Physical devices" in result
        assert "keywords: laptop, monitor" in result
        assert "2. **Software**" in result

    def test_empty_context(self, mock_openai_client, biz_cat_config):
        predictor = TaxonomyPredictor(client=mock_openai_client)
        options = [{"value": "Network"}]
        result = predictor._format_options_for_prompt(options, biz_cat_config)
        assert result == "1. **Network**"


# --- _predict_level ---


class TestPredictLevel:
    @pytest.mark.asyncio
    async def test_calls_openai_with_correct_params(self, mock_openai_client, biz_cat_config):
        mock_openai_client.chat.completions.create = AsyncMock(
            return_value=_make_llm_response("Hardware", 0.9)
        )
        predictor = TaxonomyPredictor(client=mock_openai_client)

        options = [{"value": "Hardware"}, {"value": "Software"}]
        result = await predictor._predict_level(
            "Test ticket text", biz_cat_config, "l1", options, {}
        )

        assert result["selected_value"] == "Hardware"
        assert result["confidence"] == 0.9

        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        assert call_kwargs["model"] == "gpt-4o-mini"
        assert call_kwargs["temperature"] == 1
        assert call_kwargs["response_format"]["type"] == "json_schema"
        schema = call_kwargs["response_format"]["json_schema"]["schema"]
        assert schema["properties"]["selected_value"]["enum"] == ["Hardware", "Software"]

    @pytest.mark.asyncio
    async def test_includes_prior_predictions_in_prompt(
        self, mock_openai_client, biz_cat_config
    ):
        mock_openai_client.chat.completions.create = AsyncMock(
            return_value=_make_llm_response("Laptop Issues", 0.8)
        )
        predictor = TaxonomyPredictor(client=mock_openai_client)

        options = [{"value": "Laptop Issues"}, {"value": "Desktop Issues"}]
        await predictor._predict_level(
            "Test ticket", biz_cat_config, "l2", options, {"l1": "Hardware"}
        )

        call_kwargs = mock_openai_client.chat.completions.create.call_args.kwargs
        user_msg = call_kwargs["messages"][1]["content"]
        assert "L1 (Business Category): Hardware" in user_msg
        assert "L2 (subcategory)" in user_msg


# --- _predict_single_taxonomy ---


class TestPredictSingleTaxonomy:
    @pytest.mark.asyncio
    async def test_cascading_flow(self, sample_ticket, mock_openai_client, biz_cat_config):
        """Verify L1 → L2 → L3 cascade with correct filtering at each step."""
        # Mock DB session
        mock_db = AsyncMock()

        l1_options = [{"value": "Infrastructure"}]
        l2_options = [{"value": "Network"}]
        l3_options = [{"value": "VPN"}]

        async def mock_get_options(db, config, level, client_id, filters):
            if level == "l1":
                assert filters == {}
                return l1_options
            elif level == "l2":
                assert filters == {"l1": "Infrastructure"}
                return l2_options
            elif level == "l3":
                assert filters == {"l1": "Infrastructure", "l2": "Network"}
                return l3_options

        # Mock _resolve_node
        async def mock_resolve(db, config, client_id, l1, l2, l3):
            return "INFRA-NET-VPN-001"

        predictor = TaxonomyPredictor(client=mock_openai_client)

        # Set up LLM responses for each level
        mock_openai_client.chat.completions.create = AsyncMock(
            side_effect=[
                _make_llm_response("Infrastructure", 0.9),
                _make_llm_response("Network", 0.85),
                _make_llm_response("VPN", 0.8),
            ]
        )

        with (
            patch.object(predictor, "_get_level_options", side_effect=mock_get_options),
            patch.object(predictor, "_resolve_node", side_effect=mock_resolve),
        ):
            result = await predictor._predict_single_taxonomy(
                mock_db, sample_ticket, "test text", biz_cat_config
            )

        assert result is not None
        assert result.taxonomy_type == "business_category"
        assert result.l1 == "Infrastructure"
        assert result.l2 == "Network"
        assert result.l3 == "VPN"
        assert result.node == "INFRA-NET-VPN-001"
        assert result.source == "llm"
        assert result.is_active is True
        # Average of 0.9, 0.85, 0.8
        assert abs(result.confidence_score - 0.85) < 0.001

    @pytest.mark.asyncio
    async def test_returns_none_when_no_l1_options(
        self, sample_ticket, mock_openai_client, biz_cat_config
    ):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)

        with patch.object(predictor, "_get_level_options", return_value=[]):
            result = await predictor._predict_single_taxonomy(
                mock_db, sample_ticket, "test text", biz_cat_config
            )

        assert result is None

    @pytest.mark.asyncio
    async def test_returns_none_when_no_l2_options(
        self, sample_ticket, mock_openai_client, biz_cat_config
    ):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)
        mock_openai_client.chat.completions.create = AsyncMock(
            return_value=_make_llm_response("Infrastructure", 0.9)
        )

        async def mock_get_options(db, config, level, client_id, filters):
            if level == "l1":
                return [{"value": "Infrastructure"}]
            return []  # No L2 options

        with patch.object(predictor, "_get_level_options", side_effect=mock_get_options):
            result = await predictor._predict_single_taxonomy(
                mock_db, sample_ticket, "test text", biz_cat_config
            )

        assert result is None


# --- predict_for_ticket ---


class TestPredictForTicket:
    @pytest.mark.asyncio
    async def test_runs_all_4_types(self, sample_ticket, mock_openai_client):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)

        mock_taxonomy = MagicMock(spec=TicketTaxonomy)

        with patch.object(
            predictor,
            "_predict_single_taxonomy",
            return_value=mock_taxonomy,
        ) as mock_predict:
            results = await predictor.predict_for_ticket(mock_db, sample_ticket)

        assert len(results) == 4
        assert mock_predict.call_count == 4
        # Verify all 4 configs were used
        called_types = [
            call.args[3].taxonomy_type for call in mock_predict.call_args_list
        ]
        assert set(called_types) == {
            "business_category",
            "application",
            "resolution",
            "root_cause",
        }

    @pytest.mark.asyncio
    async def test_handles_partial_failure(self, sample_ticket, mock_openai_client):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)

        call_count = [0]

        async def mock_predict(db, ticket, text, config):
            call_count[0] += 1
            if config.taxonomy_type == "application":
                raise RuntimeError("OpenAI API error")
            return MagicMock(spec=TicketTaxonomy)

        with patch.object(predictor, "_predict_single_taxonomy", side_effect=mock_predict):
            results = await predictor.predict_for_ticket(mock_db, sample_ticket)

        # 3 succeeded, 1 failed
        assert len(results) == 3

    @pytest.mark.asyncio
    async def test_handles_all_failures(self, sample_ticket, mock_openai_client):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)

        async def mock_predict(db, ticket, text, config):
            raise RuntimeError("Everything broken")

        with patch.object(predictor, "_predict_single_taxonomy", side_effect=mock_predict):
            results = await predictor.predict_for_ticket(mock_db, sample_ticket)

        assert len(results) == 0

    @pytest.mark.asyncio
    async def test_skips_none_results(self, sample_ticket, mock_openai_client):
        mock_db = AsyncMock()
        predictor = TaxonomyPredictor(client=mock_openai_client)

        async def mock_predict(db, ticket, text, config):
            if config.taxonomy_type == "root_cause":
                return None  # No options in reference table
            return MagicMock(spec=TicketTaxonomy)

        with patch.object(predictor, "_predict_single_taxonomy", side_effect=mock_predict):
            results = await predictor.predict_for_ticket(mock_db, sample_ticket)

        assert len(results) == 3


# --- TAXONOMY_CONFIGS ---


class TestTaxonomyConfigs:
    def test_all_4_types_defined(self):
        types = [c.taxonomy_type for c in TAXONOMY_CONFIGS]
        assert types == ["business_category", "application", "resolution", "root_cause"]

    def test_resolution_uses_correct_columns(self):
        res_config = TAXONOMY_CONFIGS[2]
        assert res_config.l1_col == "l1_outcome"
        assert res_config.l2_col == "l2_action_type"
        assert res_config.l3_col == "l3_resolution_code"
        assert res_config.node_col == "resolution_code"

    def test_root_cause_uses_correct_columns(self):
        rc_config = TAXONOMY_CONFIGS[3]
        assert rc_config.l1_col == "l1_cause_domain"
        assert rc_config.l2_col == "l2_cause_type"
        assert rc_config.l3_col == "l3_root_cause"
        assert rc_config.node_col == "root_cause_code_id"
