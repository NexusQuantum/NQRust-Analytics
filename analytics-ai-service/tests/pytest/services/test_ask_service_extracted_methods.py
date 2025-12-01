"""
Unit tests for extracted methods from AskService.

These tests verify the behavior of individual extracted methods
without needing to run the full ask() pipeline.
"""

from unittest.mock import AsyncMock, Mock

import pytest

from src.web.v1.services.ask import (
    AskError,
    AskHistory,
    AskResult,
    AskResultResponse,
    AskService,
)


@pytest.fixture
def mock_pipelines():
    """Create mock pipelines for testing."""
    return {
        "historical_question": Mock(),
        "sql_pairs_retrieval": Mock(),
        "instructions_retrieval": Mock(),
        "intent_classification": Mock(),
        "misleading_assistance": Mock(),
        "data_assistance": Mock(),
        "user_guide_assistance": Mock(),
        "db_schema_retrieval": Mock(),
        "followup_sql_generation_reasoning": Mock(),
        "sql_generation_reasoning": Mock(),
        "sql_functions_retrieval": Mock(),
        "followup_sql_generation": Mock(),
        "sql_generation": Mock(),
        "sql_correction": Mock(),
    }


@pytest.fixture
def ask_service(mock_pipelines):
    """Create AskService instance for testing."""
    return AskService(
        pipelines=mock_pipelines,
        allow_intent_classification=True,
        allow_sql_generation_reasoning=True,
        allow_sql_functions_retrieval=True,
        enable_column_pruning=False,
        max_sql_correction_retries=3,
        max_histories=5,
        maxsize=1000,
        ttl=120,
    )


class TestUpdateStatus:
    """Tests for _update_status() helper method."""

    def test_update_status_basic(self, ask_service):
        """Test basic status update."""
        query_id = "test-query-123"

        ask_service._update_status(
            query_id=query_id,
            status="understanding",
            trace_id="trace-123",
            is_followup=False,
        )

        result = ask_service._ask_results[query_id]
        assert result.status == "understanding"
        assert result.trace_id == "trace-123"
        assert result.is_followup is False

    def test_update_status_with_kwargs(self, ask_service):
        """Test status update with additional kwargs."""
        query_id = "test-query-456"

        ask_service._update_status(
            query_id=query_id,
            status="finished",
            trace_id="trace-456",
            is_followup=True,
            type="TEXT_TO_SQL",
            response=[AskResult(sql="SELECT * FROM users", type="llm")],
            rephrased_question="Show all users",
        )

        result = ask_service._ask_results[query_id]
        assert result.status == "finished"
        assert result.type == "TEXT_TO_SQL"
        assert len(result.response) == 1
        assert result.response[0].sql == "SELECT * FROM users"
        assert result.rephrased_question == "Show all users"

    def test_update_status_overwrites_previous(self, ask_service):
        """Test that status update overwrites previous status."""
        query_id = "test-query-789"

        # First update
        ask_service._update_status(
            query_id=query_id,
            status="understanding",
            trace_id="trace-789",
            is_followup=False,
        )

        # Second update (should overwrite)
        ask_service._update_status(
            query_id=query_id,
            status="searching",
            trace_id="trace-789",
            is_followup=False,
            type="TEXT_TO_SQL",
        )

        result = ask_service._ask_results[query_id]
        assert result.status == "searching"  # Updated
        assert result.type == "TEXT_TO_SQL"  # New field

    def test_update_status_with_error(self, ask_service):
        """Test status update with error."""
        query_id = "test-query-error"

        ask_service._update_status(
            query_id=query_id,
            status="failed",
            trace_id="trace-error",
            is_followup=False,
            type="TEXT_TO_SQL",
            error=AskError(
                code="NO_RELEVANT_DATA",
                message="No relevant data found",
            ),
        )

        result = ask_service._ask_results[query_id]
        assert result.status == "failed"
        assert result.error is not None
        assert result.error.code == "NO_RELEVANT_DATA"
        assert result.error.message == "No relevant data found"


class TestFormatFinalResponse:
    """Tests for _format_final_response() method."""

    def test_format_final_response_success(self, ask_service):
        """Test formatting successful response with SQL results."""
        query_id = "test-query-success"
        api_results = [AskResult(sql="SELECT * FROM users WHERE id = 1", type="llm")]

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=api_results,
            error_message=None,
            invalid_sql=None,
            user_query="Show user with id 1",
            rephrased_question="Get user with id 1",
            intent_reasoning="User wants to retrieve specific user",
            table_names=["users"],
            sql_generation_reasoning="Simple SELECT with WHERE clause",
            trace_id="trace-success",
            is_followup=False,
            request_from="api",
        )

        # Check response structure
        assert "ask_result" in result
        assert "metadata" in result

        # Check ask_result
        assert result["ask_result"] == api_results

        # Check metadata
        assert result["metadata"]["type"] == "TEXT_TO_SQL"
        assert result["metadata"]["error_type"] == ""
        assert result["metadata"]["request_from"] == "api"

        # Check status was updated
        status = ask_service._ask_results[query_id]
        assert status.status == "finished"
        assert status.response == api_results

    def test_format_final_response_failure(self, ask_service):
        """Test formatting failed response with no SQL results."""
        query_id = "test-query-fail"

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=None,
            error_message="SQL generation failed",
            invalid_sql="SELECT * FROM nonexistent",
            user_query="Show nonexistent table",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="trace-fail",
            is_followup=False,
            request_from="api",
        )

        # Check response structure
        assert "ask_result" in result
        assert "metadata" in result

        # Check ask_result is empty
        assert result["ask_result"] == {}

        # Check metadata has error
        assert result["metadata"]["type"] == "TEXT_TO_SQL"
        assert result["metadata"]["error_type"] == "NO_RELEVANT_SQL"
        assert result["metadata"]["error_message"] == "SQL generation failed"

        # Check status was updated with error
        status = ask_service._ask_results[query_id]
        assert status.status == "failed"
        assert status.error is not None
        assert status.error.code == "NO_RELEVANT_SQL"
        assert status.error.message == "SQL generation failed"
        assert status.invalid_sql == "SELECT * FROM nonexistent"


class TestFormatCachedResponse:
    """Tests for _format_cached_response() method."""

    def test_format_cached_response_success(self, ask_service):
        """Test formatting cached response with SQL results and status update."""
        query_id = "cached-query-success"
        api_results = [AskResult(sql="SELECT * FROM products", type="llm")]

        result = ask_service._format_cached_response(
            query_id=query_id,
            api_results=api_results,
            rephrased_question="List all products",
            intent_reasoning="User wants product list",
            table_names=["products"],
            sql_generation_reasoning="Simple select",
            trace_id="trace-cached",
            is_followup=False,
            request_from="api",
        )

        # Check response
        assert result["ask_result"] == api_results
        assert result["metadata"]["type"] == "TEXT_TO_SQL"
        assert result["metadata"]["error_type"] == ""
        assert result["metadata"]["request_from"] == "api"

        # Check status updated to finished with response
        status = ask_service._ask_results[query_id]
        assert status.status == "finished"
        assert status.response == api_results
        assert status.retrieved_tables == ["products"]
        assert status.sql_generation_reasoning == "Simple select"

    def test_format_cached_response_respects_stopped(self, ask_service):
        """If query is stopped, do not overwrite status, but still return results."""
        query_id = "cached-query-stopped"
        # Pre-mark as stopped
        ask_service._ask_results[query_id] = AskResultResponse(
            status="stopped",
            trace_id="trace-stopped",
            is_followup=False,
        )

        api_results = [AskResult(sql="SELECT 1", type="llm")]

        result = ask_service._format_cached_response(
            query_id=query_id,
            api_results=api_results,
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="trace-stopped",
            is_followup=False,
            request_from="api",
        )

        # Response is returned
        assert result["ask_result"] == api_results
        # Status remains stopped
        assert ask_service._ask_results[query_id].status == "stopped"

    def test_format_cached_response_with_tables_and_reasoning(self, ask_service):
        """Ensure retrieved_tables and reasoning are recorded in status."""
        query_id = "cached-query-details"
        api_results = [AskResult(sql="SELECT * FROM orders", type="llm")]
        tables = ["orders", "order_items"]
        reasoning = "Use orders and order_items for join"

        ask_service._format_cached_response(
            query_id=query_id,
            api_results=api_results,
            rephrased_question=None,
            intent_reasoning=None,
            table_names=tables,
            sql_generation_reasoning=reasoning,
            trace_id="trace-details",
            is_followup=True,
            request_from="api",
        )

        status = ask_service._ask_results[query_id]
        assert status.retrieved_tables == tables
        assert status.sql_generation_reasoning == reasoning

    def test_format_final_response_empty_results_list(self, ask_service):
        """Test formatting with empty api_results list (treated as failure)."""
        query_id = "test-query-empty"

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=[],  # Empty list
            error_message=None,
            invalid_sql=None,
            user_query="Some query",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=["users"],
            sql_generation_reasoning=None,
            trace_id="trace-empty",
            is_followup=False,
            request_from="api",
        )

        # Empty list is treated as no results (falsy)
        assert result["metadata"]["error_type"] == "NO_RELEVANT_SQL"

        status = ask_service._ask_results[query_id]
        assert status.status == "failed"

    def test_format_final_response_followup_query(self, ask_service):
        """Test formatting response for follow-up query."""
        query_id = "test-query-followup"
        api_results = [
            AskResult(sql="SELECT COUNT(*) FROM orders WHERE user_id = 1", type="llm")
        ]

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=api_results,
            error_message=None,
            invalid_sql=None,
            user_query="How many orders?",
            rephrased_question="Count orders for user",
            intent_reasoning="Follow-up question",
            table_names=["orders"],
            sql_generation_reasoning="COUNT aggregation",
            trace_id="trace-followup",
            is_followup=True,  # Follow-up query
            request_from="ui",
        )

        assert result["ask_result"] == api_results

        status = ask_service._ask_results[query_id]
        assert status.is_followup is True
        assert status.rephrased_question == "Count orders for user"

    def test_format_final_response_with_stopped_query(self, ask_service):
        """Test that stopped queries are not updated."""
        query_id = "test-query-stopped"

        # Pre-set status to stopped
        ask_service._update_status(
            query_id=query_id,
            status="stopped",
            trace_id="trace-stopped",
            is_followup=False,
        )

        api_results = [AskResult(sql="SELECT 1", type="llm")]

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=api_results,
            error_message=None,
            invalid_sql=None,
            user_query="Test",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="trace-stopped",
            is_followup=False,
            request_from="api",
        )

        # Status should still be "stopped", not updated to "finished"
        status = ask_service._ask_results[query_id]
        assert status.status == "stopped"

        # But response should still include results
        assert result["ask_result"] == api_results

    def test_format_final_response_default_error_message(self, ask_service):
        """Test that default error message is used when none provided."""
        query_id = "test-query-no-error-msg"

        result = ask_service._format_final_response(
            query_id=query_id,
            api_results=None,
            error_message=None,  # No error message
            invalid_sql=None,
            user_query="Test query",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="trace-no-msg",
            is_followup=False,
            request_from="api",
        )

        # Check default message is used
        status = ask_service._ask_results[query_id]
        assert status.error.message == "No relevant SQL"

        # Metadata should have empty error_message
        assert result["metadata"]["error_message"] == ""


class TestFormatResponse:
    """Tests for _format_response() wrapper method."""

    def test_format_response_delegates_success(self, ask_service):
        query_id = "format-resp-success"
        api_results = [AskResult(sql="SELECT 1", type="llm")]
        result = ask_service._format_response(
            query_id=query_id,
            api_results=api_results,
            error_message=None,
            invalid_sql=None,
            user_query="test",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="t",
            is_followup=False,
            request_from="api",
        )
        assert result["ask_result"] == api_results

    def test_format_response_delegates_failure(self, ask_service):
        query_id = "format-resp-fail"
        result = ask_service._format_response(
            query_id=query_id,
            api_results=None,
            error_message="no sql",
            invalid_sql="BAD SQL",
            user_query="test",
            rephrased_question=None,
            intent_reasoning=None,
            table_names=[],
            sql_generation_reasoning=None,
            trace_id="t",
            is_followup=False,
            request_from="api",
        )
        assert result["metadata"]["error_type"] == "NO_RELEVANT_SQL"


class TestRetrieveDatabaseSchemas:
    """Tests for _retrieve_database_schemas() method."""

    @pytest.mark.asyncio
    async def test_retrieve_schemas_success(self, ask_service, mock_pipelines):
        """Test successful schema retrieval."""
        query_id = "test-schema-success"

        # Mock pipeline to return valid documents (use AsyncMock for async method)
        mock_pipelines["db_schema_retrieval"].run = AsyncMock(
            return_value={
                "construct_retrieval_results": {
                    "retrieval_results": [
                        {
                            "table_name": "users",
                            "table_ddl": "CREATE TABLE users (id INT, name VARCHAR(100))",
                        },
                        {
                            "table_name": "orders",
                            "table_ddl": "CREATE TABLE orders (id INT, user_id INT, amount DECIMAL)",
                        },
                    ],
                    "has_calculated_field": False,
                    "has_metric": False,
                    "has_json_field": False,
                }
            }
        )

        (
            table_names,
            table_ddls,
            retrieval_result,
        ) = await ask_service._retrieve_contexts(
            query_id=query_id,
            user_query="Show me all users",
            histories=[],
            project_id="project-123",
            enable_column_pruning=False,
            trace_id="trace-123",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        # Check returned values
        assert len(table_names) == 2
        assert "users" in table_names
        assert "orders" in table_names

        assert len(table_ddls) == 2
        assert "CREATE TABLE users" in table_ddls[0]
        assert "CREATE TABLE orders" in table_ddls[1]

        assert retrieval_result["has_calculated_field"] is False

        # Check status was updated
        status = ask_service._ask_results[query_id]
        assert status.status == "searching"

    @pytest.mark.asyncio
    async def test_retrieve_schemas_no_documents_raises_error(
        self, ask_service, mock_pipelines
    ):
        """Test that ValueError is raised when no documents found."""
        query_id = "test-schema-no-docs"

        # Mock pipeline to return empty documents (use AsyncMock)
        mock_pipelines["db_schema_retrieval"].run = AsyncMock(
            return_value={
                "construct_retrieval_results": {
                    "retrieval_results": [],  # Empty!
                }
            }
        )

        # Should raise ValueError
        with pytest.raises(ValueError, match="NO_RELEVANT_DATA"):
            await ask_service._retrieve_contexts(
                query_id=query_id,
                user_query="Show nonexistent table",
                histories=[],
                project_id="project-123",
                enable_column_pruning=False,
                trace_id="trace-error",
                is_followup=False,
                rephrased_question=None,
                intent_reasoning=None,
            )

        # Check status was updated to failed
        status = ask_service._ask_results[query_id]
        assert status.status == "failed"
        assert status.error is not None
        assert status.error.code == "NO_RELEVANT_DATA"

    @pytest.mark.asyncio
    async def test_retrieve_schemas_with_column_pruning(
        self, ask_service, mock_pipelines
    ):
        """Test schema retrieval with column pruning enabled."""
        query_id = "test-schema-pruning"

        mock_pipelines["db_schema_retrieval"].run = AsyncMock(
            return_value={
                "construct_retrieval_results": {
                    "retrieval_results": [
                        {
                            "table_name": "products",
                            "table_ddl": "CREATE TABLE products (id INT, name VARCHAR(255))",
                        },
                    ],
                }
            }
        )

        await ask_service._retrieve_contexts(
            query_id=query_id,
            user_query="Show products",
            histories=[],
            project_id="project-123",
            enable_column_pruning=True,  # Enabled
            trace_id="trace-pruning",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        # Check that pipeline was called with enable_column_pruning=True
        mock_pipelines["db_schema_retrieval"].run.assert_called_once_with(
            query="Show products",
            histories=[],
            project_id="project-123",
            enable_column_pruning=True,
        )

    @pytest.mark.asyncio
    async def test_retrieve_schemas_followup_query(self, ask_service, mock_pipelines):
        """Test schema retrieval for follow-up query with history."""
        query_id = "test-schema-followup"
        histories = [
            AskHistory(sql="SELECT * FROM users", question="Show users"),
        ]

        mock_pipelines["db_schema_retrieval"].run = AsyncMock(
            return_value={
                "construct_retrieval_results": {
                    "retrieval_results": [
                        {
                            "table_name": "users",
                            "table_ddl": "CREATE TABLE users (id INT, name VARCHAR(100))",
                        },
                    ],
                }
            }
        )

        table_names, _, _ = await ask_service._retrieve_contexts(
            query_id=query_id,
            user_query="How many users?",
            histories=histories,
            project_id="project-123",
            enable_column_pruning=False,
            trace_id="trace-followup",
            is_followup=True,  # Follow-up
            rephrased_question="Count of users",
            intent_reasoning="User wants count",
        )

        assert table_names == ["users"]

        # Check status reflects follow-up
        status = ask_service._ask_results[query_id]
        assert status.is_followup is True
        assert status.rephrased_question == "Count of users"

    @pytest.mark.asyncio
    async def test_retrieve_schemas_with_metadata_flags(
        self, ask_service, mock_pipelines
    ):
        """Test that metadata flags are returned correctly."""
        query_id = "test-schema-metadata"

        mock_pipelines["db_schema_retrieval"].run = AsyncMock(
            return_value={
                "construct_retrieval_results": {
                    "retrieval_results": [
                        {
                            "table_name": "metrics",
                            "table_ddl": "CREATE TABLE metrics (...)",
                        },
                    ],
                    "has_calculated_field": True,
                    "has_metric": True,
                    "has_json_field": True,
                }
            }
        )

        _, _, retrieval_result = await ask_service._retrieve_contexts(
            query_id=query_id,
            user_query="Show metrics",
            histories=[],
            project_id="project-123",
            enable_column_pruning=False,
            trace_id="trace-metadata",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        # Check metadata flags
        assert retrieval_result["has_calculated_field"] is True
        assert retrieval_result["has_metric"] is True
        assert retrieval_result["has_json_field"] is True


class TestIsStoppedIntegration:
    """Integration tests for _is_stopped() with extracted methods."""

    def test_update_status_respects_stopped(self, ask_service):
        """Test that _is_stopped() works correctly with _update_status()."""
        query_id = "test-stopped-integration"

        # Set initial status
        ask_service._update_status(
            query_id=query_id,
            status="understanding",
            trace_id="trace",
            is_followup=False,
        )

        # Stop the query
        ask_service._update_status(
            query_id=query_id,
            status="stopped",
            trace_id="trace",
            is_followup=False,
        )

        # Check _is_stopped() returns True
        assert ask_service._is_stopped(query_id, ask_service._ask_results) is True

        # Try to update status again (should work, but in real code we check first)
        ask_service._update_status(
            query_id=query_id,
            status="finished",
            trace_id="trace",
            is_followup=False,
        )

        # Status was updated (no guard in _update_status itself)
        assert ask_service._ask_results[query_id].status == "finished"


class TestCheckHistoricalQuestion:
    """Tests for _check_historical_question() method."""

    @pytest.mark.asyncio
    async def test_cache_hit_returns_historical_results(
        self, ask_service, mock_pipelines
    ):
        """Test that cache hit returns historical SQL results."""
        # Arrange
        user_query = "SELECT * FROM users"
        project_id = "project-123"

        # Mock historical_question pipeline with cache hit
        mock_pipelines["historical_question"].run = AsyncMock(
            return_value={
                "formatted_output": {
                    "documents": [
                        {
                            "statement": "SELECT * FROM users WHERE active = true",
                            "viewId": "view-456",
                        }
                    ]
                }
            }
        )

        # Act
        (
            api_results,
            sql_reasoning,
            sql_samples,
            instructions,
        ) = await ask_service._check_historical_question(
            user_query=user_query,
            project_id=project_id,
        )

        # Assert
        assert api_results is not None
        assert len(api_results) == 1
        assert api_results[0].sql == "SELECT * FROM users WHERE active = true"
        assert api_results[0].type == "view"
        assert api_results[0].viewId == "view-456"
        assert sql_reasoning == ""
        assert sql_samples == []
        assert instructions == []

        # Pipeline was called correctly
        mock_pipelines["historical_question"].run.assert_called_once_with(
            query=user_query,
            project_id=project_id,
        )

    @pytest.mark.asyncio
    async def test_cache_hit_with_llm_type(self, ask_service, mock_pipelines):
        """Test cache hit returns LLM-generated SQL (no viewId)."""
        # Arrange
        user_query = "How many orders?"
        project_id = "project-123"

        # Mock historical_question with LLM result (no viewId)
        mock_pipelines["historical_question"].run = AsyncMock(
            return_value={
                "formatted_output": {
                    "documents": [
                        {
                            "statement": "SELECT COUNT(*) FROM orders",
                            "viewId": None,
                        }
                    ]
                }
            }
        )

        # Act
        (
            api_results,
            sql_reasoning,
            sql_samples,
            instructions,
        ) = await ask_service._check_historical_question(
            user_query=user_query,
            project_id=project_id,
        )

        # Assert
        assert api_results is not None
        assert len(api_results) == 1
        assert api_results[0].sql == "SELECT COUNT(*) FROM orders"
        assert api_results[0].type == "llm"
        assert api_results[0].viewId is None

    @pytest.mark.asyncio
    async def test_cache_miss_retrieves_samples_and_instructions(
        self, ask_service, mock_pipelines
    ):
        """Test cache miss retrieves SQL samples and instructions in parallel."""
        # Arrange
        user_query = "Show me revenue by region"
        project_id = "project-123"

        # Mock historical_question with no results (cache miss)
        mock_pipelines["historical_question"].run = AsyncMock(
            return_value={"formatted_output": {"documents": []}}
        )

        # Mock sql_pairs_retrieval and instructions_retrieval
        mock_pipelines["sql_pairs_retrieval"].run = AsyncMock(
            return_value={
                "formatted_output": {
                    "documents": [
                        {"sql": "SELECT region, SUM(amount) FROM sales GROUP BY region"}
                    ]
                }
            }
        )
        mock_pipelines["instructions_retrieval"].run = AsyncMock(
            return_value={
                "formatted_output": {
                    "documents": [{"instruction": "Use GROUP BY for aggregations"}]
                }
            }
        )

        # Act
        (
            api_results,
            sql_reasoning,
            sql_samples,
            instructions,
        ) = await ask_service._check_historical_question(
            user_query=user_query,
            project_id=project_id,
        )

        # Assert - cache miss returns None for results
        assert api_results is None
        assert sql_reasoning is None

        # But sql_samples and instructions are populated
        assert len(sql_samples) == 1
        assert (
            sql_samples[0]["sql"]
            == "SELECT region, SUM(amount) FROM sales GROUP BY region"
        )
        assert len(instructions) == 1
        assert instructions[0]["instruction"] == "Use GROUP BY for aggregations"

        # All three pipelines were called (historical + two retrievals)
        mock_pipelines["historical_question"].run.assert_called_once()
        mock_pipelines["sql_pairs_retrieval"].run.assert_called_once_with(
            query=user_query,
            project_id=project_id,
        )
        mock_pipelines["instructions_retrieval"].run.assert_called_once_with(
            query=user_query,
            project_id=project_id,
            scope="sql",
        )

    @pytest.mark.asyncio
    async def test_empty_formatted_output_is_cache_miss(
        self, ask_service, mock_pipelines
    ):
        """Test that empty formatted_output is treated as cache miss."""
        # Arrange
        user_query = "Test query"
        project_id = "project-123"

        # Mock historical_question with empty formatted_output
        mock_pipelines["historical_question"].run = AsyncMock(
            return_value={"formatted_output": {}}
        )

        mock_pipelines["sql_pairs_retrieval"].run = AsyncMock(
            return_value={"formatted_output": {"documents": []}}
        )
        mock_pipelines["instructions_retrieval"].run = AsyncMock(
            return_value={"formatted_output": {"documents": []}}
        )

        # Act
        (
            api_results,
            sql_reasoning,
            sql_samples,
            instructions,
        ) = await ask_service._check_historical_question(
            user_query=user_query,
            project_id=project_id,
        )

        # Assert - treated as cache miss
        assert api_results is None
        assert sql_reasoning is None
        assert sql_samples == []
        assert instructions == []

    @pytest.mark.asyncio
    async def test_only_top_1_result_is_returned(self, ask_service, mock_pipelines):
        """Test that only the top 1 historical result is returned."""
        # Arrange
        user_query = "Test query"
        project_id = "project-123"

        # Mock historical_question with multiple results
        mock_pipelines["historical_question"].run = AsyncMock(
            return_value={
                "formatted_output": {
                    "documents": [
                        {"statement": "SELECT 1", "viewId": "view-1"},
                        {"statement": "SELECT 2", "viewId": "view-2"},
                        {"statement": "SELECT 3", "viewId": "view-3"},
                    ]
                }
            }
        )

        # Act
        (
            api_results,
            sql_reasoning,
            sql_samples,
            instructions,
        ) = await ask_service._check_historical_question(
            user_query=user_query,
            project_id=project_id,
        )

        # Assert - only first result is returned
        assert api_results is not None
        assert len(api_results) == 1
        assert api_results[0].sql == "SELECT 1"
        assert api_results[0].viewId == "view-1"


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v"])


class TestClassifyIntent:
    """Tests for _classify_intent() method."""

    @pytest.mark.asyncio
    async def test_classify_intent_returns_values(self, ask_service, mock_pipelines):
        user_query = "How many orders?"
        histories = []
        sql_samples = [{"sql": "SELECT COUNT(*) FROM orders"}]
        instructions = [{"instruction": "Use COUNT(*)"}]

        mock_pipelines["intent_classification"].run = AsyncMock(
            return_value={
                "post_process": {
                    "intent": "TEXT_TO_SQL",
                    "rephrased_question": "What is the number of orders?",
                    "reasoning": "User asks for count",
                    "db_schemas": ["orders"],
                }
            }
        )

        intent, rephrased, reasoning, db_schemas = await ask_service._classify_intent(
            user_query=user_query,
            histories=histories,
            sql_samples=sql_samples,
            instructions=instructions,
            project_id="project-123",
            configurations={"lang": "en"},
        )

        assert intent == "TEXT_TO_SQL"
        assert rephrased == "What is the number of orders?"
        assert reasoning == "User asks for count"
        assert db_schemas == ["orders"]

    @pytest.mark.asyncio
    async def test_classify_intent_handles_missing_fields(
        self, ask_service, mock_pipelines
    ):
        mock_pipelines["intent_classification"].run = AsyncMock(
            return_value={"post_process": {}}
        )

        intent, rephrased, reasoning, db_schemas = await ask_service._classify_intent(
            user_query="q",
            histories=[],
            sql_samples=[],
            instructions=[],
            project_id="p",
            configurations=None,
        )

        assert intent is None
        assert rephrased is None
        assert reasoning is None
        assert db_schemas is None


class TestHandleGeneralQuery:
    """Tests for _handle_general_query() method."""

    @pytest.mark.asyncio
    async def test_handle_misleading_query_sets_finished_and_metadata(
        self, ask_service
    ):
        query_id = "misleading-1"
        # Ensure assistance pipeline is awaitable
        ask_service._pipelines["misleading_assistance"].run = AsyncMock(
            return_value=None
        )
        result = ask_service._handle_general_query(
            query_id=query_id,
            intent="MISLEADING_QUERY",
            user_query="irrelevant",
            histories=[],
            db_schemas=["users"],
            language="en",
            custom_instruction=None,
            rephrased_question="rq",
            intent_reasoning="r",
            trace_id="t",
            is_followup=False,
        )
        assert result is not None
        assert result["metadata"]["type"] == "MISLEADING_QUERY"
        status = ask_service._ask_results[query_id]
        assert status.status == "finished"
        assert status.general_type == "MISLEADING_QUERY"

    @pytest.mark.asyncio
    async def test_handle_general_sets_finished_and_metadata(self, ask_service):
        query_id = "general-1"
        ask_service._pipelines["data_assistance"].run = AsyncMock(return_value=None)
        result = ask_service._handle_general_query(
            query_id=query_id,
            intent="GENERAL",
            user_query="help",
            histories=[],
            db_schemas=["orders"],
            language="en",
            custom_instruction=None,
            rephrased_question=None,
            intent_reasoning=None,
            trace_id=None,
            is_followup=True,
        )
        assert result is not None
        assert result["metadata"]["type"] == "GENERAL"
        status = ask_service._ask_results[query_id]
        assert status.status == "finished"
        assert status.general_type == "DATA_ASSISTANCE"

    @pytest.mark.asyncio
    async def test_handle_user_guide_sets_finished(self, ask_service):
        query_id = "guide-1"
        ask_service._pipelines["user_guide_assistance"].run = AsyncMock(
            return_value=None
        )
        result = ask_service._handle_general_query(
            query_id=query_id,
            intent="USER_GUIDE",
            user_query="guide",
            histories=[],
            db_schemas=None,
            language="en",
            custom_instruction=None,
            rephrased_question=None,
            intent_reasoning=None,
            trace_id=None,
            is_followup=False,
        )
        assert result is not None
        status = ask_service._ask_results[query_id]
        assert status.status == "finished"
        assert status.general_type == "USER_GUIDE"

    def test_handle_text_to_sql_returns_none_and_sets_understanding(self, ask_service):
        query_id = "tts-1"
        result = ask_service._handle_general_query(
            query_id=query_id,
            intent="TEXT_TO_SQL",
            user_query="tts",
            histories=[],
            db_schemas=None,
            language="en",
            custom_instruction=None,
            rephrased_question="rq",
            intent_reasoning="r",
            trace_id="t",
            is_followup=True,
        )
        assert result is None
        status = ask_service._ask_results[query_id]
        assert status.status == "understanding"


class TestGenerateSqlReasoning:
    """Tests for _generate_sql_reasoning() method."""

    @pytest.mark.asyncio
    async def test_generate_reasoning_first_time_query(
        self, ask_service, mock_pipelines
    ):
        query_id = "gen-reason-1"
        user_query = "Show sales by region"
        table_names = ["sales"]
        table_ddls = ["CREATE TABLE sales (...)"]
        histories = []
        sql_samples = [{"sql": "SELECT region, SUM(amount) FROM sales GROUP BY region"}]
        instructions = [{"instruction": "Use GROUP BY"}]
        configurations = {"language": "en"}

        mock_pipelines["sql_generation_reasoning"].run = AsyncMock(
            return_value={"post_process": {"plan": "group by region"}}
        )

        reasoning = await ask_service._generate_sql_reasoning(
            query_id=query_id,
            user_query=user_query,
            table_names=table_names,
            table_ddls=table_ddls,
            histories=histories,
            sql_samples=sql_samples,
            instructions=instructions,
            configurations=configurations,
            trace_id="t",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        assert reasoning == {"plan": "group by region"}
        status = ask_service._ask_results[query_id]
        assert status.status == "planning"
        import json as _json

        assert _json.loads(status.sql_generation_reasoning) == {
            "plan": "group by region"
        }

    @pytest.mark.asyncio
    async def test_generate_reasoning_followup_query(self, ask_service, mock_pipelines):
        query_id = "gen-reason-2"
        user_query = "And split by month"
        table_names = ["sales"]
        table_ddls = ["CREATE TABLE sales (...)"]
        histories = [AskHistory(sql="...", question="previous q")]
        sql_samples = []
        instructions = []
        configurations = {"language": "en"}

        mock_pipelines["followup_sql_generation_reasoning"].run = AsyncMock(
            return_value={"post_process": {"plan": "add month breakdown"}}
        )

        reasoning = await ask_service._generate_sql_reasoning(
            query_id=query_id,
            user_query=user_query,
            table_names=table_names,
            table_ddls=table_ddls,
            histories=histories,
            sql_samples=sql_samples,
            instructions=instructions,
            configurations=configurations,
            trace_id="t2",
            is_followup=True,
            rephrased_question="rq",
            intent_reasoning="ir",
        )

        assert reasoning == {"plan": "add month breakdown"}
        status = ask_service._ask_results[query_id]
        assert status.status == "planning"
        assert status.retrieved_tables == table_names


class TestGenerateSql:
    """Tests for _generate_sql() method."""

    @pytest.mark.asyncio
    async def test_generate_sql_first_time(self, ask_service, mock_pipelines):
        query_id = "gen-sql-1"
        user_query = "Show users"
        table_names = ["users"]
        table_ddls = ["CREATE TABLE users (...)"]
        histories = []
        project_id = "p1"
        reasoning = {"plan": "simple select"}
        sql_samples = []
        instructions = []
        retrieval_result = {
            "has_calculated_field": False,
            "has_metric": False,
            "has_json_field": False,
        }
        allow_sql_functions_retrieval = False

        mock_pipelines["sql_generation"].run = AsyncMock(
            return_value={"post_process": {"sql": "SELECT * FROM users"}}
        )

        results = await ask_service._generate_sql(
            query_id=query_id,
            user_query=user_query,
            table_names=table_names,
            table_ddls=table_ddls,
            histories=histories,
            project_id=project_id,
            sql_generation_reasoning=reasoning,
            sql_samples=sql_samples,
            instructions=instructions,
            retrieval_result=retrieval_result,
            allow_sql_functions_retrieval=allow_sql_functions_retrieval,
            use_dry_plan=False,
            allow_dry_plan_fallback=False,
            configurations={"language": "en"},
            trace_id="t",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        assert results == {"post_process": {"sql": "SELECT * FROM users"}}
        status = ask_service._ask_results[query_id]
        assert status.status == "generating"


class TestCorrectSql:
    """Tests for _correct_sql() method."""

    @pytest.mark.asyncio
    async def test_correct_sql_succeeds_on_first_retry(
        self, ask_service, mock_pipelines
    ):
        query_id = "correct-1"
        invalid_generation_result = {
            "sql": "BAD SQL",
            "error": "syntax",
            "type": "ERROR",
        }
        table_names = ["users"]
        table_ddls = ["CREATE TABLE users (...)"]
        instructions = []

        # First correction returns valid result
        mock_pipelines["sql_correction"].run = AsyncMock(
            return_value={
                "post_process": {
                    "valid_generation_result": {"sql": "SELECT * FROM users"},
                    "invalid_generation_result": None,
                }
            }
        )

        api_results, invalid_sql, error_message = await ask_service._correct_sql(
            query_id=query_id,
            user_query="fix",
            invalid_generation_result=invalid_generation_result,
            table_names=table_names,
            table_ddls=table_ddls,
            instructions=instructions,
            project_id="p1",
            use_dry_plan=False,
            allow_dry_plan_fallback=False,
            max_retries=3,
            trace_id="t",
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        assert api_results is not None
        assert api_results[0].sql == "SELECT * FROM users"
        assert invalid_sql == "BAD SQL"
        assert error_message == "syntax"

    @pytest.mark.asyncio
    async def test_correct_sql_respects_timeout_and_stops(
        self, ask_service, mock_pipelines
    ):
        query_id = "correct-2"
        invalid_generation_result = {
            "sql": "BAD",
            "error": "timeout",
            "type": "TIME_OUT",
        }

        # Should not call correction when TIME_OUT
        mock_pipelines["sql_correction"].run = AsyncMock(return_value={})

        api_results, invalid_sql, error_message = await ask_service._correct_sql(
            query_id=query_id,
            user_query="q",
            invalid_generation_result=invalid_generation_result,
            table_names=[],
            table_ddls=[],
            instructions=[],
            project_id="p1",
            use_dry_plan=False,
            allow_dry_plan_fallback=False,
            max_retries=2,
            trace_id=None,
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        assert api_results is None
        assert invalid_sql == "BAD"
        assert error_message == "timeout"

    @pytest.mark.asyncio
    async def test_correct_sql_multiple_retries_then_fail(
        self, ask_service, mock_pipelines
    ):
        query_id = "correct-3"
        invalid_generation_result = {"sql": "BAD1", "error": "err1", "type": "ERROR"}

        # First retry returns invalid, second returns invalid again, no success
        mock_pipelines["sql_correction"].run = AsyncMock(
            side_effect=[
                {
                    "post_process": {
                        "valid_generation_result": None,
                        "invalid_generation_result": {"sql": "BAD2", "error": "err2"},
                    }
                },
                {
                    "post_process": {
                        "valid_generation_result": None,
                        "invalid_generation_result": {"sql": "BAD3", "error": "err3"},
                    }
                },
            ]
        )

        api_results, invalid_sql, error_message = await ask_service._correct_sql(
            query_id=query_id,
            user_query="q",
            invalid_generation_result=invalid_generation_result,
            table_names=[],
            table_ddls=[],
            instructions=[],
            project_id="p1",
            use_dry_plan=False,
            allow_dry_plan_fallback=False,
            max_retries=2,
            trace_id=None,
            is_followup=False,
            rephrased_question=None,
            intent_reasoning=None,
        )

        assert api_results is None
        assert invalid_sql == "BAD3"
        assert error_message == "err3"

    @pytest.mark.asyncio
    async def test_generate_sql_followup(self, ask_service, mock_pipelines):
        query_id = "gen-sql-2"
        user_query = "And only active ones"
        table_names = ["users"]
        table_ddls = ["CREATE TABLE users (...)"]
        histories = [AskHistory(sql="...", question="q")]
        project_id = "p1"
        reasoning = {"plan": "where active"}
        sql_samples = []
        instructions = []
        retrieval_result = {
            "has_calculated_field": True,
            "has_metric": False,
            "has_json_field": True,
        }
        allow_sql_functions_retrieval = True

        mock_pipelines["sql_functions_retrieval"].run = AsyncMock(
            return_value=["UDF_HELPER"]
        )
        mock_pipelines["followup_sql_generation"].run = AsyncMock(
            return_value={
                "post_process": {"sql": "SELECT * FROM users WHERE active = true"}
            }
        )

        results = await ask_service._generate_sql(
            query_id=query_id,
            user_query=user_query,
            table_names=table_names,
            table_ddls=table_ddls,
            histories=histories,
            project_id=project_id,
            sql_generation_reasoning=reasoning,
            sql_samples=sql_samples,
            instructions=instructions,
            retrieval_result=retrieval_result,
            allow_sql_functions_retrieval=allow_sql_functions_retrieval,
            use_dry_plan=True,
            allow_dry_plan_fallback=True,
            configurations={"language": "en"},
            trace_id="t2",
            is_followup=True,
            rephrased_question="rq",
            intent_reasoning="ir",
        )

        assert results == {
            "post_process": {"sql": "SELECT * FROM users WHERE active = true"}
        }
        status = ask_service._ask_results[query_id]
        assert status.status == "generating"
