"""Unit tests for services/enrichment.py — mocked DB + LLM."""

import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from models import EnrichmentStatus, Ticket, TicketTaxonomy


@pytest.fixture
def ticket_id():
    return uuid.uuid4()


@pytest.fixture
def mock_ticket(ticket_id):
    ticket = MagicMock(spec=Ticket)
    ticket.ticket_id = ticket_id
    ticket.client_id = uuid.uuid4()
    ticket.short_desc = "Laptop won't boot"
    ticket.full_desc = "Laptop shows black screen on startup"
    ticket.enrichment_status = None
    return ticket


@pytest.fixture
def mock_taxonomy():
    tax = MagicMock(spec=TicketTaxonomy)
    tax.taxonomy_type = "business_category"
    tax.l1 = "Hardware"
    tax.l2 = "Laptop"
    tax.l3 = "Boot Failure"
    return tax


class TestEnrichTicket:
    """Tests for enrich_ticket() function."""

    @pytest.mark.asyncio
    async def test_happy_path_sets_completed(self, ticket_id, mock_ticket, mock_taxonomy):
        """enrich_ticket loads ticket, runs prediction, sets COMPLETED."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_ticket
        mock_session.execute.return_value = mock_result
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("services.enrichment.AsyncSessionLocal", return_value=mock_session),
            patch(
                "services.llm.extract_taxonomies",
                new_callable=AsyncMock,
                return_value=[mock_taxonomy],
            ),
        ):
            from services.enrichment import enrich_ticket

            await enrich_ticket(ticket_id)

        # Should set PROCESSING then COMPLETED
        assert mock_ticket.enrichment_status == EnrichmentStatus.COMPLETED
        mock_session.add_all.assert_called_once_with([mock_taxonomy])
        assert mock_session.commit.await_count >= 2  # once for PROCESSING, once for COMPLETED

    @pytest.mark.asyncio
    async def test_ticket_not_found_logs_error(self, ticket_id):
        """enrich_ticket returns early if ticket doesn't exist."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with (
            patch("services.enrichment.AsyncSessionLocal", return_value=mock_session),
            patch("services.enrichment.logger") as mock_logger,
        ):
            from services.enrichment import enrich_ticket

            await enrich_ticket(ticket_id)

        mock_logger.error.assert_called_once()
        assert "not found" in mock_logger.error.call_args[0][0]

    @pytest.mark.asyncio
    async def test_llm_failure_sets_failed(self, ticket_id, mock_ticket):
        """enrich_ticket sets FAILED if extract_taxonomies raises."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_ticket
        mock_session.execute.return_value = mock_result
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        # Error session for setting FAILED status
        mock_err_session = AsyncMock()
        mock_err_ticket = MagicMock(spec=Ticket)
        mock_err_ticket.enrichment_status = None
        mock_err_result = MagicMock()
        mock_err_result.scalar_one_or_none.return_value = mock_err_ticket
        mock_err_session.execute.return_value = mock_err_result
        mock_err_session.__aenter__ = AsyncMock(return_value=mock_err_session)
        mock_err_session.__aexit__ = AsyncMock(return_value=False)

        call_count = 0

        def session_factory():
            nonlocal call_count
            call_count += 1
            if call_count == 1:
                return mock_session
            return mock_err_session

        with (
            patch("services.enrichment.AsyncSessionLocal", side_effect=session_factory),
            patch(
                "services.llm.extract_taxonomies",
                new_callable=AsyncMock,
                side_effect=RuntimeError("OpenAI API down"),
            ),
        ):
            from services.enrichment import enrich_ticket

            await enrich_ticket(ticket_id)

        # First session sets PROCESSING, then error occurs
        assert mock_ticket.enrichment_status == EnrichmentStatus.PROCESSING
        # Error session sets FAILED
        assert mock_err_ticket.enrichment_status == EnrichmentStatus.FAILED
        mock_err_session.commit.assert_awaited()

    @pytest.mark.asyncio
    async def test_creates_own_session(self, ticket_id, mock_ticket, mock_taxonomy):
        """enrich_ticket creates its own AsyncSessionLocal, not request-scoped."""
        mock_session = AsyncMock()
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_ticket
        mock_session.execute.return_value = mock_result
        mock_session.__aenter__ = AsyncMock(return_value=mock_session)
        mock_session.__aexit__ = AsyncMock(return_value=False)

        with (
            patch(
                "services.enrichment.AsyncSessionLocal", return_value=mock_session
            ) as mock_factory,
            patch(
                "services.llm.extract_taxonomies",
                new_callable=AsyncMock,
                return_value=[mock_taxonomy],
            ),
        ):
            from services.enrichment import enrich_ticket

            await enrich_ticket(ticket_id)

        mock_factory.assert_called()  # Proves it creates its own session


class TestWorkerSettings:
    """Tests for worker.py configuration."""

    def test_worker_has_enrich_function(self):
        from worker import WorkerSettings, run_enrich_ticket

        assert run_enrich_ticket in WorkerSettings.functions

    def test_worker_uses_redis_url_from_config(self):
        from worker import WorkerSettings

        assert WorkerSettings.redis_settings is not None


class TestEnrichmentStatus:
    """Tests for EnrichmentStatus enum."""

    def test_all_statuses_defined(self):
        assert EnrichmentStatus.PENDING.value == "PENDING"
        assert EnrichmentStatus.PROCESSING.value == "PROCESSING"
        assert EnrichmentStatus.COMPLETED.value == "COMPLETED"
        assert EnrichmentStatus.FAILED.value == "FAILED"

    def test_enrichment_status_in_ticket_read(self):
        from schemas import TicketRead

        assert "enrichment_status" in TicketRead.model_fields
