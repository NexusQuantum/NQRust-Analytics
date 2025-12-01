import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, SSEEvent

logger = logging.getLogger("analytics-service")


# ============================================================================
# DATA MODELS - Cleaned up with better documentation
# ============================================================================


class SqlAnswerRequest(BaseRequest):
    """Request model for sql answer endpoint"""

    query: str
    sql: str
    sql_data: Dict
    custom_instruction: Optional[str] = None


class SqlAnswerResponse(BaseModel):
    """Response model for sql answer endpoint"""

    query_id: str


class SqlAnswerResultRequest(BaseModel):
    """Request model for getting sql answer result"""

    query_id: str


class SqlAnswerError(BaseModel):
    """Error model for sql answer response"""

    code: Literal["OTHERS"]
    message: str


class SqlAnswerResultResponse(BaseModel):
    """Response model for sql answer result"""

    status: Literal["preprocessing", "succeeded", "failed"]
    num_rows_used_in_llm: Optional[int] = None
    error: Optional[SqlAnswerError] = None
    trace_id: Optional[str] = None


# ============================================================================
# CONTEXT DATA CLASS - New for better structure
# ============================================================================


@dataclass
class SqlAnswerContext:
    """Context for sql answer operations - extracted for better structure"""

    query_id: str
    query: str
    sql: str
    sql_data: Dict
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None
    custom_instruction: Optional[str] = None


class SqlAnswerService:
    """Clean implementation of sql answer service with better structure"""

    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._sql_answer_results: Dict[str, SqlAnswerResultResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    # ========================================================================
    # HELPER METHODS - Cleaned up and better organized
    # ========================================================================

    def _update_status(
        self,
        query_id: str,
        status: str,
        trace_id: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Update sql answer status in cache with better error handling"""
        try:
            self._sql_answer_results[query_id] = SqlAnswerResultResponse(
                status=status,
                trace_id=trace_id,
                **kwargs,
            )
        except Exception as e:
            logger.error(f"Failed to update status for {query_id}: {e}")

    def _preprocess_sql_data(self, context: SqlAnswerContext) -> Dict:
        """Preprocess SQL data using pipeline"""
        try:
            preprocessed_sql_data = self._pipelines["preprocess_sql_data"].run(
                sql_data=context.sql_data,
            )["preprocess"]
            return preprocessed_sql_data

        except Exception as e:
            logger.error(f"Error preprocessing SQL data: {e}")
            raise

    def _start_sql_answer_task(
        self, context: SqlAnswerContext, preprocessed_sql_data: Dict
    ) -> None:
        """Start SQL answer task asynchronously"""
        try:
            asyncio.create_task(
                self._pipelines["sql_answer"].run(
                    query=context.query,
                    sql=context.sql,
                    sql_data=preprocessed_sql_data.get("sql_data", {}),
                    language=context.configurations.get("language", "en"),
                    current_time=context.configurations.get(
                        "show_current_time", lambda: ""
                    )(),
                    query_id=context.query_id,
                    custom_instruction=context.custom_instruction,
                )
            )
        except Exception as e:
            logger.error(f"Error starting SQL answer task: {e}")
            raise

    def _format_result(
        self, context: SqlAnswerContext, preprocessed_sql_data: Dict
    ) -> dict:
        """Format result with proper error handling"""
        try:
            results = {
                "metadata": {
                    "error": {
                        "type": "",
                        "message": "",
                    },
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

            if preprocessed_sql_data.get("num_rows_used_in_llm") == 0:
                results["metadata"]["error"]["type"] = "NO_DATA"
                results["metadata"]["error"]["message"] = "No data to answer"

            return results

        except Exception as e:
            logger.error(f"Error formatting result: {e}")
            return {
                "metadata": {
                    "error": {
                        "type": "OTHERS",
                        "message": str(e),
                    },
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

    @observe(name="SQL Answer")
    @trace_metadata
    async def sql_answer(
        self,
        sql_answer_request: SqlAnswerRequest,
        **kwargs,
    ) -> dict:
        """
        Main sql answer method - rewritten with clean architecture

        Args:
            sql_answer_request: Sql answer request object
            **kwargs: Additional metadata

        Returns:
            dict: Sql answer result with metadata
        """
        trace_id = kwargs.get("trace_id")
        query_id = sql_answer_request.query_id

        # Create context for better organization
        context = SqlAnswerContext(
            query_id=query_id,
            query=sql_answer_request.query,
            sql=sql_answer_request.sql,
            sql_data=sql_answer_request.sql_data,
            project_id=sql_answer_request.project_id,
            configurations=sql_answer_request.configurations.model_dump()
            if sql_answer_request.configurations
            else {},
            trace_id=trace_id,
            custom_instruction=sql_answer_request.custom_instruction,
        )

        try:
            # Step 1: Update status to preprocessing
            self._update_status(
                context.query_id,
                status="preprocessing",
                trace_id=context.trace_id,
            )

            # Step 2: Preprocess SQL data
            preprocessed_sql_data = self._preprocess_sql_data(context)

            # Step 3: Update status to succeeded
            self._update_status(
                context.query_id,
                status="succeeded",
                num_rows_used_in_llm=preprocessed_sql_data.get("num_rows_used_in_llm"),
                trace_id=context.trace_id,
            )

            # Step 4: Start SQL answer task asynchronously
            self._start_sql_answer_task(context, preprocessed_sql_data)

            # Step 5: Format result
            return self._format_result(context, preprocessed_sql_data)

        except Exception as e:
            logger.exception(f"sql answer pipeline - OTHERS: {e}")

            self._update_status(
                context.query_id,
                status="failed",
                error=SqlAnswerError(
                    code="OTHERS",
                    message=str(e),
                ),
                trace_id=context.trace_id,
            )

            return {
                "metadata": {
                    "error": {
                        "type": "OTHERS",
                        "message": str(e),
                    },
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

    def get_sql_answer_result(
        self,
        sql_answer_result_request: SqlAnswerResultRequest,
    ) -> SqlAnswerResultResponse:
        """Get sql answer result - clean implementation"""
        try:
            result = self._sql_answer_results.get(sql_answer_result_request.query_id)

            if result is None:
                logger.exception(
                    f"sql answer pipeline - OTHERS: {sql_answer_result_request.query_id} is not found"
                )
                return SqlAnswerResultResponse(
                    status="failed",
                    error=SqlAnswerError(
                        code="OTHERS",
                        message=f"{sql_answer_result_request.query_id} is not found",
                    ),
                )

            return result

        except Exception as e:
            logger.error(f"Error getting sql answer result: {e}")
            return SqlAnswerResultResponse(
                status="failed",
                error=SqlAnswerError(
                    code="OTHERS",
                    message=str(e),
                ),
            )

    async def get_sql_answer_streaming_result(
        self,
        query_id: str,
    ):
        """Get sql answer streaming result - clean implementation"""
        try:
            result = self._sql_answer_results.get(query_id)

            if result and result.status == "succeeded":
                async for chunk in self._pipelines["sql_answer"].get_streaming_results(
                    query_id
                ):
                    event = SSEEvent(
                        data=SSEEvent.SSEEventMessage(message=chunk),
                    )
                    yield event.serialize()

        except Exception as e:
            logger.error(f"Error getting sql answer streaming result: {e}")
            return
