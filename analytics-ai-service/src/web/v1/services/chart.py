import logging
from dataclasses import dataclass
from typing import Any, Dict, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest

logger = logging.getLogger("analytics-service")


# ============================================================================
# DATA MODELS - Cleaned up with better documentation
# ============================================================================


class ChartRequest(BaseRequest):
    """Request model for chart endpoint"""

    query: str
    sql: str
    data: Optional[Dict[str, Any]] = None
    remove_data_from_chart_schema: bool = True
    custom_instruction: Optional[str] = None


class ChartResponse(BaseModel):
    """Response model for chart endpoint"""

    query_id: str


class StopChartRequest(BaseRequest):
    """Request model for stopping chart"""

    status: Literal["stopped"]


class StopChartResponse(BaseModel):
    """Response model for stopping chart"""

    query_id: str


class ChartError(BaseModel):
    """Error model for chart response"""

    code: Literal["NO_CHART", "OTHERS"]
    message: str


class ChartResultRequest(BaseModel):
    """Request model for getting chart result"""

    query_id: str


class ChartResult(BaseModel):
    """Result model for chart response"""

    reasoning: str
    chart_type: Literal[
        "line", "bar", "pie", "grouped_bar", "stacked_bar", "area", "multi_line", ""
    ]  # empty string for no chart
    chart_schema: dict


class ChartResultResponse(BaseModel):
    """Response model for chart result"""

    status: Literal["fetching", "generating", "finished", "failed", "stopped"]
    response: Optional[ChartResult] = None
    error: Optional[ChartError] = None
    trace_id: Optional[str] = None


# ============================================================================
# CONTEXT DATA CLASS - New for better structure
# ============================================================================


@dataclass
class ChartContext:
    """Context for chart operations - extracted for better structure"""

    query_id: str
    query: str
    sql: str
    data: Optional[Dict[str, Any]]
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None
    remove_data_from_chart_schema: bool = True
    custom_instruction: Optional[str] = None


class ChartService:
    """Clean implementation of chart service with better structure"""

    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._chart_results: Dict[str, ChartResultResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    # ========================================================================
    # HELPER METHODS - Cleaned up and better organized
    # ========================================================================

    def _is_stopped(self, query_id: str) -> bool:
        """Check if chart is stopped"""
        result = self._chart_results.get(query_id)
        return result is not None and result.status == "stopped"

    def _update_status(
        self,
        query_id: str,
        status: str,
        trace_id: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Update chart status in cache with better error handling"""
        try:
            self._chart_results[query_id] = ChartResultResponse(
                status=status,
                trace_id=trace_id,
                **kwargs,
            )
        except Exception as e:
            logger.error(f"Failed to update status for {query_id}: {e}")

    async def _fetch_sql_data(self, context: ChartContext) -> Dict[str, Any]:
        """Fetch SQL data if not provided"""
        try:
            if not context.data:
                self._update_status(
                    context.query_id,
                    status="fetching",
                    trace_id=context.trace_id,
                )

                sql_data = (
                    await self._pipelines["sql_executor"].run(
                        sql=context.sql,
                        project_id=context.project_id,
                    )
                )["execute_sql"]["results"]
                return sql_data
            else:
                return context.data

        except Exception as e:
            logger.error(f"Error fetching SQL data: {e}")
            raise

    async def _generate_chart(
        self, context: ChartContext, sql_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate chart using pipeline"""
        try:
            self._update_status(
                context.query_id,
                status="generating",
                trace_id=context.trace_id,
            )

            chart_generation_result = await self._pipelines["chart_generation"].run(
                query=context.query,
                sql=context.sql,
                data=sql_data,
                language=context.configurations.get("language", "en"),
                remove_data_from_chart_schema=context.remove_data_from_chart_schema,
                custom_instruction=context.custom_instruction,
            )

            return chart_generation_result["post_process"]["results"]

        except Exception as e:
            logger.error(f"Error generating chart: {e}")
            raise

    def _format_chart_result(
        self, chart_result: Dict[str, Any], context: ChartContext
    ) -> dict:
        """Format chart result with proper error handling"""
        try:
            if not chart_result.get("chart_schema", {}) and not chart_result.get(
                "reasoning", ""
            ):
                self._update_status(
                    context.query_id,
                    status="failed",
                    error=ChartError(
                        code="NO_CHART", message="chart generation failed"
                    ),
                    trace_id=context.trace_id,
                )
                return {
                    "chart_result": {},
                    "metadata": {
                        "error_type": "NO_CHART",
                        "error_message": "chart generation failed",
                        "request_from": context.configurations.get("request_from", ""),
                    },
                }
            else:
                self._update_status(
                    context.query_id,
                    status="finished",
                    response=ChartResult(**chart_result),
                    trace_id=context.trace_id,
                )
                return {
                    "chart_result": chart_result,
                    "metadata": {
                        "error_type": "",
                        "error_message": "",
                        "request_from": context.configurations.get("request_from", ""),
                    },
                }

        except Exception as e:
            logger.error(f"Error formatting chart result: {e}")
            return {
                "chart_result": {},
                "metadata": {
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

    @observe(name="Generate Chart")
    @trace_metadata
    async def chart(
        self,
        chart_request: ChartRequest,
        **kwargs,
    ) -> dict:
        """
        Main chart method - rewritten with clean architecture

        Args:
            chart_request: Chart request object
            **kwargs: Additional metadata

        Returns:
            dict: Chart result with metadata
        """
        trace_id = kwargs.get("trace_id")
        query_id = chart_request.query_id

        # Create context for better organization
        context = ChartContext(
            query_id=query_id,
            query=chart_request.query,
            sql=chart_request.sql,
            data=chart_request.data,
            project_id=chart_request.project_id,
            configurations=chart_request.configurations.model_dump()
            if chart_request.configurations
            else {},
            trace_id=trace_id,
            remove_data_from_chart_schema=chart_request.remove_data_from_chart_schema,
            custom_instruction=chart_request.custom_instruction,
        )

        try:
            # Step 1: Fetch SQL data if not provided
            sql_data = await self._fetch_sql_data(context)

            # Step 2: Generate chart
            chart_result = await self._generate_chart(context, sql_data)

            # Step 3: Format result
            return self._format_chart_result(chart_result, context)

        except Exception as e:
            logger.exception(f"chart pipeline - OTHERS: {e}")

            self._update_status(
                context.query_id,
                status="failed",
                error=ChartError(
                    code="OTHERS",
                    message=str(e),
                ),
                trace_id=context.trace_id,
            )

            return {
                "chart_result": {},
                "metadata": {
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

    def stop_chart(
        self,
        stop_chart_request: StopChartRequest,
    ) -> None:
        """Stop chart request - clean implementation"""
        try:
            self._chart_results[stop_chart_request.query_id] = ChartResultResponse(
                status="stopped",
            )
        except Exception as e:
            logger.error(f"Error stopping chart request: {e}")

    def get_chart_result(
        self,
        chart_result_request: ChartResultRequest,
    ) -> ChartResultResponse:
        """Get chart result - clean implementation"""
        try:
            result = self._chart_results.get(chart_result_request.query_id)

            if result is None:
                logger.exception(
                    f"chart pipeline - OTHERS: {chart_result_request.query_id} is not found"
                )
                return ChartResultResponse(
                    status="failed",
                    error=ChartError(
                        code="OTHERS",
                        message=f"{chart_result_request.query_id} is not found",
                    ),
                )

            return result

        except Exception as e:
            logger.error(f"Error getting chart result: {e}")
            return ChartResultResponse(
                status="failed",
                error=ChartError(
                    code="OTHERS",
                    message=str(e),
                ),
            )
