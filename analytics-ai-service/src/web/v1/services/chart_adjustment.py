import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest

logger = logging.getLogger("analytics-service")


@dataclass
class ChartAdjustmentContext:
    """Context for chart adjustment operations"""

    query_id: str
    query: str
    sql: str
    adjustment_option: dict
    chart_schema: dict
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None


# POST /v1/chart-adjustments
class ChartAdjustmentOption(BaseModel):
    """Chart adjustment option model"""

    chart_type: Literal[
        "bar", "grouped_bar", "line", "pie", "stacked_bar", "area", "multi_line"
    ]
    x_axis: Optional[str] = None
    y_axis: Optional[str] = None
    x_offset: Optional[str] = None
    color: Optional[str] = None
    theta: Optional[str] = None


class ChartAdjustmentRequest(BaseRequest):
    """Request model for chart adjustment endpoint"""

    query: str
    sql: str
    adjustment_option: ChartAdjustmentOption
    chart_schema: dict


class ChartAdjustmentResponse(BaseModel):
    """Response model for chart adjustment endpoint"""

    query_id: str


# PATCH /v1/chart-adjustments/{query_id}
class StopChartAdjustmentRequest(BaseRequest):
    """Request model for stopping chart adjustment"""

    status: Literal["stopped"]


class StopChartAdjustmentResponse(BaseModel):
    """Response model for stopping chart adjustment"""

    query_id: str


# GET /v1/chart-adjustments/{query_id}/result
class ChartAdjustmentError(BaseModel):
    """Error model for chart adjustment response"""

    code: Literal["NO_CHART", "OTHERS"]
    message: str


class ChartAdjustmentResultRequest(BaseModel):
    """Request model for getting chart adjustment result"""

    query_id: str


class ChartAdjustmentResult(BaseModel):
    """Result model for chart adjustment response"""

    reasoning: str
    chart_type: Literal[
        "line", "bar", "pie", "grouped_bar", "stacked_bar", "area", "multi_line", ""
    ]  # empty string for no chart
    chart_schema: dict


class ChartAdjustmentResultResponse(BaseModel):
    """Response model for chart adjustment result"""

    status: Literal[
        "understanding", "fetching", "generating", "finished", "failed", "stopped"
    ]
    response: Optional[ChartAdjustmentResult] = None
    error: Optional[ChartAdjustmentError] = None
    trace_id: Optional[str] = None


class ChartAdjustmentService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._chart_adjustment_results: Dict[
            str, ChartAdjustmentResultResponse
        ] = TTLCache(maxsize=maxsize, ttl=ttl)

    def _is_stopped(self, query_id: str) -> bool:
        """Check if chart adjustment is stopped"""
        result = self._chart_adjustment_results.get(query_id)
        return result is not None and result.status == "stopped"

    def _update_status(
        self,
        query_id: str,
        status: str,
        trace_id: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Update chart adjustment status in cache with better error handling"""
        try:
            self._chart_adjustment_results[query_id] = ChartAdjustmentResultResponse(
                status=status,
                trace_id=trace_id,
                **kwargs,
            )
        except Exception as e:
            logger.error(f"Failed to update status for {query_id}: {e}")

    async def _fetch_sql_data(self, context: ChartAdjustmentContext) -> dict:
        """Fetch SQL data using pipeline"""
        try:
            return (
                await self._pipelines["sql_executor"].run(
                    sql=context.sql,
                    project_id=context.project_id,
                )
            )["execute_sql"]["results"]
        except Exception as e:
            logger.error(f"Error fetching SQL data: {e}")
            raise

    async def _generate_chart_adjustment(
        self, context: ChartAdjustmentContext, sql_data: dict
    ) -> dict:
        """Generate chart adjustment using pipeline"""
        try:
            return await self._pipelines["chart_adjustment"].run(
                query=context.query,
                sql=context.sql,
                adjustment_option=context.adjustment_option,
                chart_schema=context.chart_schema,
                data=sql_data,
                language=context.configurations.get("language", "en"),
            )
        except Exception as e:
            logger.error(f"Error generating chart adjustment: {e}")
            raise

    def _format_chart_result(
        self, chart_result: dict, context: ChartAdjustmentContext
    ) -> dict:
        """Format chart result with proper error handling"""
        try:
            if not chart_result.get("chart_schema", {}) and not chart_result.get(
                "reasoning", ""
            ):
                self._update_status(
                    context.query_id,
                    status="failed",
                    error=ChartAdjustmentError(
                        code="NO_CHART", message="chart generation failed"
                    ),
                    trace_id=context.trace_id,
                )
                return {
                    "chart_adjustment_result": {},
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
                    response=ChartAdjustmentResult(**chart_result),
                    trace_id=context.trace_id,
                )
                return {
                    "chart_adjustment_result": chart_result,
                    "metadata": {
                        "error_type": "",
                        "error_message": "",
                        "request_from": context.configurations.get("request_from", ""),
                    },
                }
        except Exception as e:
            logger.error(f"Error formatting chart result: {e}")
            return {
                "chart_adjustment_result": {},
                "metadata": {
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": context.configurations.get("request_from", ""),
                },
            }

    @observe(name="Adjust Chart")
    @trace_metadata
    async def chart_adjustment(
        self,
        chart_adjustment_request: ChartAdjustmentRequest,
        **kwargs,
    ):
        """Adjust chart - clean implementation"""
        trace_id = kwargs.get("trace_id")
        query_id = chart_adjustment_request.query_id

        # Create context for better organization
        context = ChartAdjustmentContext(
            query_id=query_id,
            query=chart_adjustment_request.query,
            sql=chart_adjustment_request.sql,
            adjustment_option=chart_adjustment_request.adjustment_option.model_dump(),
            chart_schema=chart_adjustment_request.chart_schema,
            project_id=chart_adjustment_request.project_id,
            configurations=chart_adjustment_request.configurations.model_dump()
            if chart_adjustment_request.configurations
            else {},
            trace_id=trace_id,
        )

        results = {
            "chart_adjustment_result": {},
            "metadata": {
                "error_type": "",
                "error_message": "",
                "request_from": context.configurations.get("request_from", ""),
            },
        }

        try:
            # Step 1: Update status to fetching
            self._update_status(context.query_id, "fetching", context.trace_id)

            # Step 2: Fetch SQL data
            sql_data = await self._fetch_sql_data(context)

            # Step 3: Update status to generating
            self._update_status(context.query_id, "generating", context.trace_id)

            # Step 4: Generate chart adjustment
            chart_adjustment_result = await self._generate_chart_adjustment(
                context, sql_data
            )
            chart_result = chart_adjustment_result["post_process"]["results"]

            # Step 5: Format result
            return self._format_chart_result(chart_result, context)

        except Exception as e:
            logger.error(f"chart adjustment pipeline failed: {e}")

            self._update_status(
                context.query_id,
                status="failed",
                error=ChartAdjustmentError(
                    code="OTHERS",
                    message=str(e),
                ),
                trace_id=context.trace_id,
            )

            results["metadata"]["error_type"] = "OTHERS"
            results["metadata"]["error_message"] = str(e)
            return results

    def stop_chart_adjustment(
        self,
        stop_chart_adjustment_request: StopChartAdjustmentRequest,
    ) -> None:
        """Stop chart adjustment request - clean implementation"""
        try:
            self._chart_adjustment_results[
                stop_chart_adjustment_request.query_id
            ] = ChartAdjustmentResultResponse(
                status="stopped",
            )
        except Exception as e:
            logger.error(f"Error stopping chart adjustment request: {e}")

    def get_chart_adjustment_result(
        self,
        chart_adjustment_result_request: ChartAdjustmentResultRequest,
    ) -> ChartAdjustmentResultResponse:
        """Get chart adjustment result - clean implementation"""
        try:
            result = self._chart_adjustment_results.get(
                chart_adjustment_result_request.query_id
            )

            if result is None:
                logger.warning(
                    f"Chart adjustment result not found: {chart_adjustment_result_request.query_id}"
                )
                return ChartAdjustmentResultResponse(
                    status="failed",
                    error=ChartAdjustmentError(
                        code="OTHERS",
                        message=f"{chart_adjustment_result_request.query_id} is not found",
                    ),
                )

            return result

        except Exception as e:
            logger.error(f"Error getting chart adjustment result: {e}")
            return ChartAdjustmentResultResponse(
                status="failed",
                error=ChartAdjustmentError(
                    code="OTHERS",
                    message=str(e),
                ),
            )
