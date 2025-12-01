import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest
from src.web.v1.services.ask import AskError, AskResult

logger = logging.getLogger("analytics-service")


@dataclass
class AskFeedbackContext:
    """Context for ask feedback operations"""

    query_id: str
    question: str
    tables: List[str]
    sql_generation_reasoning: str
    sql: str
    project_id: str
    request_from: Literal["ui", "api"]
    trace_id: Optional[str] = None


# POST /v1/ask-feedbacks
class AskFeedbackRequest(BaseRequest):
    """Request model for ask feedback endpoint"""

    question: str
    tables: List[str]
    sql_generation_reasoning: str
    sql: str


class AskFeedbackResponse(BaseModel):
    """Response model for ask feedback endpoint"""

    query_id: str


# PATCH /v1/ask-feedbacks/{query_id}
class StopAskFeedbackRequest(BaseRequest):
    """Request model for stopping ask feedback"""

    status: Literal["stopped"]


class StopAskFeedbackResponse(BaseModel):
    """Response model for stopping ask feedback"""

    query_id: str


# GET /v1/ask-feedbacks/{query_id}
class AskFeedbackResultRequest(BaseModel):
    """Request model for getting ask feedback result"""

    query_id: str


class AskFeedbackResultResponse(BaseModel):
    """Response model for ask feedback result"""

    status: Literal[
        "searching",
        "generating",
        "correcting",
        "finished",
        "failed",
        "stopped",
    ]
    invalid_sql: Optional[str] = None
    error: Optional[AskError] = None
    response: Optional[List[AskResult]] = None
    trace_id: Optional[str] = None


class AskFeedbackService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        allow_sql_functions_retrieval: bool = True,
        allow_sql_diagnosis: bool = True,
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._ask_feedback_results: Dict[str, AskFeedbackResultResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )
        self._allow_sql_functions_retrieval = allow_sql_functions_retrieval
        self._allow_sql_diagnosis = allow_sql_diagnosis

    def _is_stopped(self, query_id: str, container: dict) -> bool:
        """Check if ask feedback is stopped"""
        result = container.get(query_id)
        return result is not None and result.status == "stopped"

    def _update_status(
        self,
        query_id: str,
        status: str,
        trace_id: Optional[str] = None,
        **kwargs,
    ) -> None:
        """Update ask feedback status in cache with better error handling"""
        try:
            self._ask_feedback_results[query_id] = AskFeedbackResultResponse(
                status=status,
                trace_id=trace_id,
                **kwargs,
            )
        except Exception as e:
            logger.error(f"Failed to update status for {query_id}: {e}")

    async def _retrieve_context_data(self, context: AskFeedbackContext) -> tuple:
        """Retrieve context data from multiple pipelines"""
        try:
            retrieval_task, sql_samples_task, instructions_task = await asyncio.gather(
                self._pipelines["db_schema_retrieval"].run(
                    tables=context.tables,
                    project_id=context.project_id,
                ),
                self._pipelines["sql_pairs_retrieval"].run(
                    query=context.question,
                    project_id=context.project_id,
                ),
                self._pipelines["instructions_retrieval"].run(
                    query=context.question,
                    project_id=context.project_id,
                    scope="sql",
                ),
            )
            return retrieval_task, sql_samples_task, instructions_task
        except Exception as e:
            logger.error(f"Error retrieving context data: {e}")
            raise

    async def _get_sql_functions(self, context: AskFeedbackContext) -> list:
        """Get SQL functions if allowed"""
        try:
            if self._allow_sql_functions_retrieval:
                return await self._pipelines["sql_functions_retrieval"].run(
                    project_id=context.project_id,
                )
            return []
        except Exception as e:
            logger.error(f"Error getting SQL functions: {e}")
            return []

    async def _generate_sql_regeneration(
        self,
        context: AskFeedbackContext,
        table_ddls: list,
        sql_samples: list,
        instructions: list,
        sql_functions: list,
        has_calculated_field: bool,
        has_metric: bool,
        has_json_field: bool,
    ) -> dict:
        """Generate SQL regeneration using pipeline"""
        try:
            return await self._pipelines["sql_regeneration"].run(
                contexts=table_ddls,
                sql_generation_reasoning=context.sql_generation_reasoning,
                sql=context.sql,
                project_id=context.project_id,
                sql_samples=sql_samples,
                instructions=instructions,
                has_calculated_field=has_calculated_field,
                has_metric=has_metric,
                has_json_field=has_json_field,
                sql_functions=sql_functions,
            )
        except Exception as e:
            logger.error(f"Error generating SQL regeneration: {e}")
            raise

    async def _correct_sql(
        self, context: AskFeedbackContext, failed_dry_run_result: dict
    ) -> dict:
        """Correct SQL using correction pipeline"""
        try:
            return await self._pipelines["sql_correction"].run(
                contexts=[],
                invalid_generation_result=failed_dry_run_result,
                project_id=context.project_id,
            )
        except Exception as e:
            logger.error(f"Error correcting SQL: {e}")
            raise

    @observe(name="Ask Feedback")
    @trace_metadata
    async def ask_feedback(
        self,
        ask_feedback_request: AskFeedbackRequest,
        **kwargs,
    ):
        """Generate ask feedback - clean implementation"""
        trace_id = kwargs.get("trace_id")
        query_id = ask_feedback_request.query_id

        # Create context for better organization
        context = AskFeedbackContext(
            query_id=query_id,
            question=ask_feedback_request.question,
            tables=ask_feedback_request.tables,
            sql_generation_reasoning=ask_feedback_request.sql_generation_reasoning,
            sql=ask_feedback_request.sql,
            project_id=ask_feedback_request.project_id,
            request_from=ask_feedback_request.request_from,
            trace_id=trace_id,
        )

        results = {
            "ask_feedback_result": {},
            "metadata": {
                "error_type": "",
                "error_message": "",
                "request_from": context.request_from,
            },
        }

        try:
            # Step 1: Check if stopped and update status
            if not self._is_stopped(context.query_id, self._ask_feedback_results):
                self._update_status(context.query_id, "searching", context.trace_id)

                # Step 2: Retrieve context data
                (
                    retrieval_task,
                    sql_samples_task,
                    instructions_task,
                ) = await self._retrieve_context_data(context)
                sql_functions = await self._get_sql_functions(context)

                # Step 3: Extract results from completed tasks
                _retrieval_result = retrieval_task.get(
                    "construct_retrieval_results", {}
                )
                has_calculated_field = _retrieval_result.get(
                    "has_calculated_field", False
                )
                has_metric = _retrieval_result.get("has_metric", False)
                has_json_field = _retrieval_result.get("has_json_field", False)
                documents = _retrieval_result.get("retrieval_results", [])
                table_ddls = [document.get("table_ddl") for document in documents]
                sql_samples = sql_samples_task["formatted_output"].get("documents", [])
                instructions = instructions_task["formatted_output"].get(
                    "documents", []
                )

            # Step 4: Generate SQL regeneration
            if not self._is_stopped(context.query_id, self._ask_feedback_results):
                self._update_status(context.query_id, "generating", context.trace_id)

                text_to_sql_generation_results = await self._generate_sql_regeneration(
                    context,
                    table_ddls,
                    sql_samples,
                    instructions,
                    sql_functions,
                    has_calculated_field,
                    has_metric,
                    has_json_field,
                )

                # Step 5: Process generation results
                api_results = []
                error_message = None
                invalid_sql = None

                if sql_valid_result := text_to_sql_generation_results["post_process"][
                    "valid_generation_result"
                ]:
                    api_results = [
                        AskResult(sql=sql_valid_result.get("sql"), type="llm")
                    ]
                elif failed_dry_run_result := text_to_sql_generation_results[
                    "post_process"
                ]["invalid_generation_result"]:
                    if failed_dry_run_result["type"] != "TIME_OUT":
                        self._update_status(
                            context.query_id, "correcting", context.trace_id
                        )

                        sql_correction_results = await self._correct_sql(
                            context, failed_dry_run_result
                        )

                        if valid_generation_result := sql_correction_results[
                            "post_process"
                        ]["valid_generation_result"]:
                            api_results = [
                                AskResult(
                                    sql=valid_generation_result.get("sql"), type="llm"
                                )
                            ]
                        elif failed_dry_run_result := sql_correction_results[
                            "post_process"
                        ]["invalid_generation_result"]:
                            invalid_sql = failed_dry_run_result["sql"]
                            error_message = failed_dry_run_result["error"]
                    else:
                        invalid_sql = failed_dry_run_result["sql"]
                        error_message = failed_dry_run_result["error"]

                # Step 6: Handle results
                if api_results:
                    if not self._is_stopped(
                        context.query_id, self._ask_feedback_results
                    ):
                        self._update_status(
                            context.query_id,
                            "finished",
                            response=api_results,
                            trace_id=context.trace_id,
                        )
                    results["ask_feedback_result"] = api_results
                else:
                    logger.warning("ask feedback pipeline - NO_RELEVANT_SQL")
                    if not self._is_stopped(
                        context.query_id, self._ask_feedback_results
                    ):
                        self._update_status(
                            context.query_id,
                            "failed",
                            error=AskError(
                                code="NO_RELEVANT_SQL",
                                message=error_message or "No relevant SQL",
                            ),
                            invalid_sql=invalid_sql,
                            trace_id=context.trace_id,
                        )
                    results["metadata"]["error_type"] = "NO_RELEVANT_SQL"
                    results["metadata"]["error_message"] = error_message

            return results

        except Exception as e:
            logger.error(f"ask feedback pipeline failed: {e}")

            self._update_status(
                context.query_id,
                "failed",
                error=AskError(code="OTHERS", message=str(e)),
                trace_id=context.trace_id,
            )

            results["metadata"]["error_type"] = "OTHERS"
            results["metadata"]["error_message"] = str(e)
            return results

    def stop_ask_feedback(
        self,
        stop_ask_feedback_request: StopAskFeedbackRequest,
    ) -> None:
        """Stop ask feedback request - clean implementation"""
        try:
            self._ask_feedback_results[
                stop_ask_feedback_request.query_id
            ] = AskFeedbackResultResponse(
                status="stopped",
            )
        except Exception as e:
            logger.error(f"Error stopping ask feedback request: {e}")

    def get_ask_feedback_result(
        self,
        ask_feedback_result_request: AskFeedbackResultRequest,
    ) -> AskFeedbackResultResponse:
        """Get ask feedback result - clean implementation"""
        try:
            result = self._ask_feedback_results.get(
                ask_feedback_result_request.query_id
            )

            if result is None:
                logger.warning(
                    f"Ask feedback result not found: {ask_feedback_result_request.query_id}"
                )
                return AskFeedbackResultResponse(
                    status="failed",
                    error=AskError(
                        code="OTHERS",
                        message=f"{ask_feedback_result_request.query_id} is not found",
                    ),
                )

            return result

        except Exception as e:
            logger.error(f"Error getting ask feedback result: {e}")
            return AskFeedbackResultResponse(
                status="failed",
                error=AskError(
                    code="OTHERS",
                    message=str(e),
                ),
            )
