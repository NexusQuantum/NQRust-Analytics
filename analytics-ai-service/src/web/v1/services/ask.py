import asyncio
import json
import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional, Tuple

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import AliasChoices, BaseModel, Field

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, SSEEvent

logger = logging.getLogger("analytics-service")


# ============================================================================
# DATA MODELS - Cleaned up with better documentation
# ============================================================================


class AskHistory(BaseModel):
    """History of previous ask requests in conversation"""

    sql: str
    question: str


class AskRequest(BaseRequest):
    """Request model for ask endpoint"""

    query: str
    # don't recommend to use id as a field name, but it's used in the older version of API spec
    # so we need to support as a choice, and will remove it in the future
    mdl_hash: Optional[str] = Field(
        validation_alias=AliasChoices("mdl_hash", "id"),
        description="MDL hash for project context",
    )
    histories: Optional[List[AskHistory]] = Field(
        default_factory=list, description="Previous conversation history"
    )
    ignore_sql_generation_reasoning: bool = False
    enable_column_pruning: bool = False
    use_dry_plan: bool = False
    allow_dry_plan_fallback: bool = True
    custom_instruction: Optional[str] = None


class AskResponse(BaseModel):
    """Response model for ask endpoint"""

    query_id: str


class StopAskRequest(BaseRequest):
    """Request model for stopping ask"""

    status: Literal["stopped"]


class StopAskResponse(BaseModel):
    """Response model for stopping ask"""

    query_id: str


class AskResult(BaseModel):
    """Result model for ask response"""

    sql: str
    type: Literal["llm", "view"] = "llm"
    viewId: Optional[str] = None


class AskError(BaseModel):
    """Error model for ask response"""

    code: Literal["NO_RELEVANT_DATA", "NO_RELEVANT_SQL", "OTHERS"]
    message: str


class AskResultRequest(BaseModel):
    """Request model for getting ask result"""

    query_id: str


class _AskResultResponse(BaseModel):
    status: Literal[
        "understanding",
        "searching",
        "planning",
        "generating",
        "correcting",
        "finished",
        "failed",
        "stopped",
    ]
    rephrased_question: Optional[str] = None
    intent_reasoning: Optional[str] = None
    sql_generation_reasoning: Optional[str] = None
    type: Optional[Literal["GENERAL", "TEXT_TO_SQL"]] = None
    retrieved_tables: Optional[List[str]] = None
    response: Optional[List[AskResult]] = None
    invalid_sql: Optional[str] = None
    error: Optional[AskError] = None
    trace_id: Optional[str] = None
    is_followup: bool = False
    general_type: Optional[
        Literal["MISLEADING_QUERY", "DATA_ASSISTANCE", "USER_GUIDE"]
    ] = None


class AskResultResponse(_AskResultResponse):
    """Response model for ask result"""

    is_followup: Optional[bool] = Field(False, exclude=True)
    general_type: Optional[
        Literal["MISLEADING_QUERY", "DATA_ASSISTANCE", "USER_GUIDE"]
    ] = Field(None, exclude=True)


# ============================================================================
# CONTEXT DATA CLASS - New for better structure
# ============================================================================


@dataclass
class AskContext:
    """Context for ask operations - extracted for better structure"""

    query_id: str
    user_query: str
    project_id: str
    histories: List[AskHistory]
    configurations: dict
    trace_id: Optional[str] = None
    rephrased_question: Optional[str] = None
    intent_reasoning: Optional[str] = None
    sql_generation_reasoning: Optional[str] = None
    table_names: List[str] = None
    table_ddls: List[str] = None
    sql_samples: List[dict] = None
    instructions: List[dict] = None


class AskService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        allow_intent_classification: bool = True,
        allow_sql_generation_reasoning: bool = True,
        allow_sql_functions_retrieval: bool = True,
        allow_sql_diagnosis: bool = True,
        enable_column_pruning: bool = False,
        max_sql_correction_retries: int = 3,
        max_histories: int = 5,
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._ask_results: Dict[str, AskResultResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )
        self._allow_sql_generation_reasoning = allow_sql_generation_reasoning
        self._allow_sql_functions_retrieval = allow_sql_functions_retrieval
        self._allow_intent_classification = allow_intent_classification
        self._allow_sql_diagnosis = allow_sql_diagnosis
        self._enable_column_pruning = enable_column_pruning
        self._max_histories = max_histories
        self._max_sql_correction_retries = max_sql_correction_retries

    # ========================================================================
    # HELPER METHODS - Cleaned up and better organized
    # ========================================================================

    def _is_stopped(self, query_id: str, container: dict) -> bool:
        """Check if query is stopped"""
        result = container.get(query_id)
        return result is not None and result.status == "stopped"

    def _update_status(
        self,
        query_id: str,
        status: str,
        trace_id: Optional[str] = None,
        is_followup: bool = False,
        **kwargs,
    ) -> None:
        """Update query status in cache with better error handling"""
        try:
            self._ask_results[query_id] = AskResultResponse(
                status=status,
                trace_id=trace_id,
                is_followup=is_followup,
                **kwargs,
            )
        except Exception as e:
            logger.error(f"Failed to update status for {query_id}: {e}")

    async def _check_historical_question(
        self,
        user_query: str,
        project_id: str,
    ) -> Tuple[Optional[List[AskResult]], Optional[str], List[dict], List[dict]]:
        """
        Check if the question has been answered before (cache hit).

        This method queries the historical question cache to see if an identical or
        very similar question has been asked before. If found, it returns the cached
        SQL result directly. Otherwise, it retrieves SQL samples and instructions
        for SQL generation.

        Args:
            user_query: User's natural language question
            project_id: Project identifier for historical context

        Returns:
            Tuple of (api_results, sql_generation_reasoning, sql_samples, instructions):
            - api_results: List of cached SQL results if found, None otherwise
            - sql_generation_reasoning: Empty string if cached, None otherwise
            - sql_samples: List of example SQL queries (empty if cached)
            - instructions: List of retrieval instructions (empty if cached)
        """
        try:
            historical_question = await self._pipelines["historical_question"].run(
                query=user_query,
                project_id=project_id,
            )

            # we only return top 1 result
            historical_question_result = historical_question.get(
                "formatted_output", {}
            ).get("documents", [])[:1]

            if historical_question_result:
                # Cache hit - return historical results
                api_results = [
                    AskResult(
                        sql=result.get("statement"),
                        type="view" if result.get("viewId") else "llm",
                        viewId=result.get("viewId"),
                    )
                    for result in historical_question_result
                ]
                return api_results, "", [], []

            # Cache miss - retrieve sql_samples and instructions in parallel
            (
                sql_samples,
                instructions,
            ) = await self._retrieve_sql_samples_and_instructions(
                user_query=user_query,
                project_id=project_id,
            )

            return None, None, sql_samples, instructions

        except Exception as e:
            logger.error(f"Error checking historical question: {e}")
            return None, None, [], []

    async def _retrieve_sql_samples_and_instructions(
        self,
        user_query: str,
        project_id: str,
    ) -> Tuple[List[dict], List[dict]]:
        """
        Retrieve SQL samples and instructions in parallel for aiding SQL generation.

        Args:
            user_query: User's natural language query
            project_id: Project identifier for retrieval scope

        Returns:
            A tuple of (sql_samples, instructions) lists.
        """
        try:
            sql_samples_task, instructions_task = await asyncio.gather(
                self._pipelines["sql_pairs_retrieval"].run(
                    query=user_query,
                    project_id=project_id,
                ),
                self._pipelines["instructions_retrieval"].run(
                    query=user_query,
                    project_id=project_id,
                    scope="sql",
                ),
            )

            sql_samples = sql_samples_task.get("formatted_output", {}).get(
                "documents", []
            )
            instructions = instructions_task.get("formatted_output", {}).get(
                "documents", []
            )

            return sql_samples, instructions

        except Exception as e:
            logger.error(f"Error retrieving SQL samples and instructions: {e}")
            return [], []

    async def _classify_intent(
        self,
        user_query: str,
        histories: List[AskHistory],
        sql_samples: List[dict],
        instructions: List[dict],
        project_id: str,
        configurations: Optional[dict],
    ) -> Tuple[Optional[str], Optional[str], Optional[str], Optional[List[dict]]]:
        """
        Classify the user's intent and return associated metadata.

        Args:
            user_query: The current user query text (potentially rephrased later)
            histories: Conversation histories (latest first)
            sql_samples: Retrieved SQL example pairs
            instructions: Retrieved instructions for SQL generation
            project_id: Project identifier
            configurations: Optional configurations from request

        Returns:
            A tuple: (intent, rephrased_question, intent_reasoning, db_schemas)
        """
        try:
            result = await self._pipelines["intent_classification"].run(
                query=user_query,
                histories=histories,
                sql_samples=sql_samples,
                instructions=instructions,
                project_id=project_id,
                configuration=configurations,
            )

            post_process = result.get("post_process", {})
            intent = post_process.get("intent")
            rephrased_question = post_process.get("rephrased_question")
            intent_reasoning = post_process.get("reasoning")
            db_schemas = post_process.get("db_schemas")

            return intent, rephrased_question, intent_reasoning, db_schemas

        except Exception as e:
            logger.error(f"Error classifying intent: {e}")
            return None, None, None, None

    async def _generate_sql_reasoning(
        self,
        *,
        query_id: str,
        user_query: str,
        table_names: List[str],
        table_ddls: List[str],
        histories: List[AskHistory],
        sql_samples: List[dict],
        instructions: List[dict],
        configurations: dict,
        trace_id: Optional[str],
        is_followup: bool,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
    ) -> dict:
        """
        Generate SQL planning/reasoning and update status to planning before and after.

        Returns the reasoning dict from pipeline post_process.
        """
        try:
            # Initial planning status
            self._update_status(
                query_id=query_id,
                status="planning",
                type="TEXT_TO_SQL",
                rephrased_question=rephrased_question,
                intent_reasoning=intent_reasoning,
                retrieved_tables=table_names,
                trace_id=trace_id,
                is_followup=is_followup,
            )

            if histories:
                sql_generation_reasoning = (
                    await self._pipelines["followup_sql_generation_reasoning"].run(
                        query=user_query,
                        contexts=table_ddls,
                        histories=histories,
                        sql_samples=sql_samples,
                        instructions=instructions,
                        configuration=configurations,
                        query_id=query_id,
                    )
                ).get("post_process", {})
            else:
                sql_generation_reasoning = (
                    await self._pipelines["sql_generation_reasoning"].run(
                        query=user_query,
                        contexts=table_ddls,
                        sql_samples=sql_samples,
                        instructions=instructions,
                        configuration=configurations,
                        query_id=query_id,
                    )
                ).get("post_process", {})

            # Update planning status with reasoning filled in
            reasoning_text = (
                sql_generation_reasoning
                if isinstance(sql_generation_reasoning, str)
                else (
                    json.dumps(sql_generation_reasoning, ensure_ascii=False)
                    if sql_generation_reasoning
                    else None
                )
            )
            self._update_status(
                query_id=query_id,
                status="planning",
                type="TEXT_TO_SQL",
                rephrased_question=rephrased_question,
                intent_reasoning=intent_reasoning,
                retrieved_tables=table_names,
                sql_generation_reasoning=reasoning_text,
                trace_id=trace_id,
                is_followup=is_followup,
            )

            return sql_generation_reasoning

        except Exception as e:
            logger.error(f"Error generating SQL reasoning: {e}")
            return {}

    def _handle_general_query(
        self,
        *,
        query_id: str,
        intent: Optional[str],
        user_query: str,
        histories: List[AskHistory],
        db_schemas: Optional[List[dict]],
        language: str,
        custom_instruction: Optional[str],
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
        trace_id: Optional[str],
        is_followup: bool,
    ) -> Optional[dict]:
        """
        Handle non TEXT_TO_SQL intents by dispatching assistance tasks and
        returning a finished response. Returns None for TEXT_TO_SQL intent
        to allow the pipeline to continue.

        Args are intentionally fully expanded to keep the method pure and
        easy to unit test without AskRequest.
        """
        try:
            if intent == "MISLEADING_QUERY":
                asyncio.create_task(
                    self._pipelines["misleading_assistance"].run(
                        query=user_query,
                        histories=histories,
                        db_schemas=db_schemas,
                        language=language,
                        query_id=query_id,
                        custom_instruction=custom_instruction,
                    )
                )

                self._update_status(
                    query_id=query_id,
                    status="finished",
                    type="GENERAL",
                    rephrased_question=rephrased_question,
                    intent_reasoning=intent_reasoning,
                    trace_id=trace_id,
                    is_followup=is_followup,
                    general_type="MISLEADING_QUERY",
                )
                return {"ask_result": {}, "metadata": {"type": "MISLEADING_QUERY"}}

            if intent == "GENERAL":
                asyncio.create_task(
                    self._pipelines["data_assistance"].run(
                        query=user_query,
                        histories=histories,
                        db_schemas=db_schemas,
                        language=language,
                        query_id=query_id,
                        custom_instruction=custom_instruction,
                    )
                )

                self._update_status(
                    query_id=query_id,
                    status="finished",
                    type="GENERAL",
                    rephrased_question=rephrased_question,
                    intent_reasoning=intent_reasoning,
                    trace_id=trace_id,
                    is_followup=is_followup,
                    general_type="DATA_ASSISTANCE",
                )
                return {"ask_result": {}, "metadata": {"type": "GENERAL"}}

            if intent == "USER_GUIDE":
                asyncio.create_task(
                    self._pipelines["user_guide_assistance"].run(
                        query=user_query,
                        language=language,
                        query_id=query_id,
                        custom_instruction=custom_instruction,
                    )
                )

                self._update_status(
                    query_id=query_id,
                    status="finished",
                    type="GENERAL",
                    rephrased_question=rephrased_question,
                    intent_reasoning=intent_reasoning,
                    trace_id=trace_id,
                    is_followup=is_followup,
                    general_type="USER_GUIDE",
                )
                return {"ask_result": {}, "metadata": {"type": "GENERAL"}}

            # Default: continue for TEXT_TO_SQL or unknown
            self._update_status(
                query_id=query_id,
                status="understanding",
                type="TEXT_TO_SQL",
                rephrased_question=rephrased_question,
                intent_reasoning=intent_reasoning,
                trace_id=trace_id,
                is_followup=is_followup,
            )
            return None

        except Exception as e:
            logger.error(f"Error handling general query: {e}")
            return None

    async def _generate_sql(
        self,
        *,
        query_id: str,
        user_query: str,
        table_names: List[str],
        table_ddls: List[str],
        histories: List[AskHistory],
        project_id: str,
        sql_generation_reasoning: Optional[dict | str],
        sql_samples: List[dict],
        instructions: List[dict],
        retrieval_result: dict,
        allow_sql_functions_retrieval: bool,
        use_dry_plan: bool,
        allow_dry_plan_fallback: bool,
        configurations: dict,
        trace_id: Optional[str],
        is_followup: bool,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
    ) -> dict:
        """
        Generate SQL using the appropriate pipeline (follow-up vs first-time).
        Updates status to generating and handles optional SQL function retrieval.
        Returns raw generation results from the pipeline.
        """
        try:
            # Set generating status
            self._update_status(
                query_id=query_id,
                status="generating",
                type="TEXT_TO_SQL",
                rephrased_question=rephrased_question,
                intent_reasoning=intent_reasoning,
                retrieved_tables=table_names,
                sql_generation_reasoning=(
                    sql_generation_reasoning
                    if isinstance(sql_generation_reasoning, str)
                    else (
                        json.dumps(sql_generation_reasoning, ensure_ascii=False)
                        if sql_generation_reasoning
                        else None
                    )
                ),
                trace_id=trace_id,
                is_followup=is_followup,
            )

            # Retrieve optional SQL functions
            if allow_sql_functions_retrieval:
                sql_functions = await self._pipelines["sql_functions_retrieval"].run(
                    project_id=project_id,
                )
            else:
                sql_functions = []

            has_calculated_field = retrieval_result.get("has_calculated_field", False)
            has_metric = retrieval_result.get("has_metric", False)
            has_json_field = retrieval_result.get("has_json_field", False)

            if histories:
                generation_results = await self._pipelines[
                    "followup_sql_generation"
                ].run(
                    query=user_query,
                    contexts=table_ddls,
                    sql_generation_reasoning=sql_generation_reasoning,
                    histories=histories,
                    project_id=project_id,
                    sql_samples=sql_samples,
                    instructions=instructions,
                    has_calculated_field=has_calculated_field,
                    has_metric=has_metric,
                    has_json_field=has_json_field,
                    sql_functions=sql_functions,
                    use_dry_plan=use_dry_plan,
                    allow_dry_plan_fallback=allow_dry_plan_fallback,
                )
            else:
                generation_results = await self._pipelines["sql_generation"].run(
                    query=user_query,
                    contexts=table_ddls,
                    sql_generation_reasoning=sql_generation_reasoning,
                    project_id=project_id,
                    sql_samples=sql_samples,
                    instructions=instructions,
                    has_calculated_field=has_calculated_field,
                    has_metric=has_metric,
                    has_json_field=has_json_field,
                    sql_functions=sql_functions,
                    use_dry_plan=use_dry_plan,
                    allow_dry_plan_fallback=allow_dry_plan_fallback,
                )

            return generation_results

        except Exception as e:
            logger.error(f"Error generating SQL: {e}")
            return {}

    async def _retrieve_database_schemas(
        self,
        query_id: str,
        user_query: str,
        histories: List[AskHistory],
        project_id: str,
        enable_column_pruning: bool,
        trace_id: Optional[str],
        is_followup: bool,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
    ) -> Tuple[List[str], List[str], dict]:
        """
        Retrieve relevant database schemas for SQL generation.

        Args:
            query_id: Unique identifier for the query
            user_query: User's query text
            histories: List of previous Q&A in conversation
            project_id: Project identifier
            enable_column_pruning: Whether to enable column pruning
            trace_id: Trace ID for observability
            is_followup: Whether this is a follow-up query
            rephrased_question: Rephrased question from intent classification
            intent_reasoning: Reasoning from intent classification

        Returns:
            tuple: (table_names, table_ddls, retrieval_result_dict)

        Raises:
            ValueError: If no relevant database schemas found (NO_RELEVANT_DATA error)
        """
        try:
            self._update_status(
                query_id=query_id,
                status="searching",
                trace_id=trace_id,
                is_followup=is_followup,
                type="TEXT_TO_SQL",
                rephrased_question=rephrased_question,
                intent_reasoning=intent_reasoning,
            )

            retrieval_result = await self._pipelines["db_schema_retrieval"].run(
                query=user_query,
                histories=histories,
                project_id=project_id,
                enable_column_pruning=enable_column_pruning,
            )

            _retrieval_result = retrieval_result.get("construct_retrieval_results", {})
            documents = _retrieval_result.get("retrieval_results", [])

            if not documents:
                logger.exception(f"ask pipeline - NO_RELEVANT_DATA: {user_query}")
                if not self._is_stopped(query_id, self._ask_results):
                    self._update_status(
                        query_id=query_id,
                        status="failed",
                        trace_id=trace_id,
                        is_followup=is_followup,
                        type="TEXT_TO_SQL",
                        error=AskError(
                            code="NO_RELEVANT_DATA",
                            message="No relevant data",
                        ),
                        rephrased_question=rephrased_question,
                        intent_reasoning=intent_reasoning,
                    )
                # Raise exception to signal error to caller
                raise ValueError("NO_RELEVANT_DATA")

            table_names = [document.get("table_name") for document in documents]
            table_ddls = [document.get("table_ddl") for document in documents]

            return table_names, table_ddls, _retrieval_result

        except ValueError:
            # Re-raise ValueError for NO_RELEVANT_DATA
            raise
        except Exception as e:
            logger.error(f"Error retrieving database schemas: {e}")
            raise ValueError("NO_RELEVANT_DATA")

    async def _retrieve_contexts(
        self,
        query_id: str,
        user_query: str,
        histories: List[AskHistory],
        project_id: str,
        enable_column_pruning: bool,
        trace_id: Optional[str],
        is_followup: bool,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
    ) -> tuple[List[str], List[str], dict]:
        """
        Retrieve contexts (table names, DDLs, and retrieval metadata) for SQL generation.

        This is a thin wrapper around `_retrieve_database_schemas()` to align with
        the refactoring plan's naming without altering behavior.
        """
        return await self._retrieve_database_schemas(
            query_id=query_id,
            user_query=user_query,
            histories=histories,
            project_id=project_id,
            enable_column_pruning=enable_column_pruning,
            trace_id=trace_id,
            is_followup=is_followup,
            rephrased_question=rephrased_question,
            intent_reasoning=intent_reasoning,
        )

    async def _correct_sql(
        self,
        *,
        query_id: str,
        user_query: str,
        invalid_generation_result: dict,
        table_names: List[str],
        table_ddls: List[str],
        instructions: List[dict],
        project_id: str,
        use_dry_plan: bool,
        allow_dry_plan_fallback: bool,
        max_retries: int,
        trace_id: Optional[str],
        is_followup: bool,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
    ) -> Tuple[Optional[List[AskResult]], Optional[str], Optional[str]]:
        """
        Attempt to correct invalid SQL up to max_retries times.
        Returns (api_results, invalid_sql, error_message).
        """
        try:
            current_retries = 0
            failed_result = invalid_generation_result
            invalid_sql: Optional[str] = None
            error_message: Optional[str] = None
            api_results: Optional[List[AskResult]] = None

            while current_retries < max_retries:
                invalid_sql = failed_result["sql"]
                error_message = failed_result.get("error")

                if failed_result.get("type") == "TIME_OUT":
                    break

                current_retries += 1

                self._update_status(
                    query_id=query_id,
                    status="correcting",
                    type="TEXT_TO_SQL",
                    rephrased_question=rephrased_question,
                    intent_reasoning=intent_reasoning,
                    retrieved_tables=table_names,
                    sql_generation_reasoning=None,
                    trace_id=trace_id,
                    is_followup=is_followup,
                )

                sql_correction_results = await self._pipelines["sql_correction"].run(
                    contexts=table_ddls,
                    instructions=instructions,
                    invalid_generation_result=failed_result,
                    project_id=project_id,
                    use_dry_plan=use_dry_plan,
                    allow_dry_plan_fallback=allow_dry_plan_fallback,
                )

                if valid_generation_result := sql_correction_results["post_process"][
                    "valid_generation_result"
                ]:
                    api_results = [
                        AskResult(
                            sql=valid_generation_result.get("sql"),
                            type="llm",
                        )
                    ]
                    break

                failed_result = sql_correction_results["post_process"][
                    "invalid_generation_result"
                ]

            # If still no success, return the latest failed result details
            if api_results is None and failed_result:
                invalid_sql = failed_result.get("sql", invalid_sql)
                error_message = failed_result.get("error", error_message)

            return api_results, invalid_sql, error_message

        except Exception as e:
            logger.error(f"Error correcting SQL: {e}")
            return None, invalid_sql, str(e)

    def _format_final_response(
        self,
        query_id: str,
        api_results: Optional[List[AskResult]],
        error_message: Optional[str],
        invalid_sql: Optional[str],
        user_query: str,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
        table_names: List[str],
        sql_generation_reasoning: Optional[str],
        trace_id: Optional[str],
        is_followup: bool,
        request_from: str,
    ) -> dict:
        """
        Format final response based on results.

        Args:
            query_id: Unique identifier for the query
            api_results: List of AskResult if SQL generation succeeded
            error_message: Error message if SQL generation failed
            invalid_sql: Invalid SQL if correction failed
            user_query: Original user query
            rephrased_question: Rephrased question from intent classification
            intent_reasoning: Reasoning from intent classification
            table_names: List of retrieved table names
            sql_generation_reasoning: SQL generation reasoning
            trace_id: Trace ID for observability
            is_followup: Whether this is a follow-up query
            request_from: Request source for metadata

        Returns:
            dict: Formatted response with ask_result and metadata
        """
        try:
            results = {
                "ask_result": {},
                "metadata": {
                    "type": "TEXT_TO_SQL",
                    "error_type": "",
                    "error_message": "",
                    "request_from": request_from,
                },
            }

            if api_results:
                if not self._is_stopped(query_id, self._ask_results):
                    self._update_status(
                        query_id=query_id,
                        status="finished",
                        trace_id=trace_id,
                        is_followup=is_followup,
                        type="TEXT_TO_SQL",
                        response=api_results,
                        rephrased_question=rephrased_question,
                        intent_reasoning=intent_reasoning,
                        retrieved_tables=table_names,
                        sql_generation_reasoning=sql_generation_reasoning,
                    )
                results["ask_result"] = api_results
            else:
                logger.exception(f"ask pipeline - NO_RELEVANT_SQL: {user_query}")
                if not self._is_stopped(query_id, self._ask_results):
                    self._update_status(
                        query_id=query_id,
                        status="failed",
                        trace_id=trace_id,
                        is_followup=is_followup,
                        type="TEXT_TO_SQL",
                        error=AskError(
                            code="NO_RELEVANT_SQL",
                            message=error_message or "No relevant SQL",
                        ),
                        rephrased_question=rephrased_question,
                        intent_reasoning=intent_reasoning,
                        retrieved_tables=table_names,
                        sql_generation_reasoning=sql_generation_reasoning,
                        invalid_sql=invalid_sql,
                    )
                results["metadata"]["error_type"] = "NO_RELEVANT_SQL"
                results["metadata"]["error_message"] = error_message or ""

            return results

        except Exception as e:
            logger.error(f"Error formatting final response: {e}")
            return {
                "ask_result": {},
                "metadata": {
                    "type": "TEXT_TO_SQL",
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": request_from,
                },
            }

    def _format_cached_response(
        self,
        query_id: str,
        api_results: List[AskResult],
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
        table_names: List[str],
        sql_generation_reasoning: Optional[str],
        trace_id: Optional[str],
        is_followup: bool,
        request_from: str,
    ) -> dict:
        """
        Format response for a cache-hit (historical question) scenario.

        This mirrors the successful branch of `_format_final_response` but is
        specific to cases where SQL results are already available from cache.

        Args:
            query_id: Unique identifier for the query
            api_results: List of AskResult objects derived from cache
            rephrased_question: Rephrased question from intent classification
            intent_reasoning: Reasoning text from intent classification
            table_names: Retrieved table names (if any, may be empty for cache)
            sql_generation_reasoning: Optional planning/reasoning text
            trace_id: Optional trace identifier
            is_followup: Whether this is a follow-up query
            request_from: Request source for metadata

        Returns:
            A results dictionary with ask_result and metadata populated.
        """
        try:
            results = {
                "ask_result": {},
                "metadata": {
                    "type": "TEXT_TO_SQL",
                    "error_type": "",
                    "error_message": "",
                    "request_from": request_from,
                },
            }

            if not self._is_stopped(query_id, self._ask_results):
                self._update_status(
                    query_id=query_id,
                    status="finished",
                    trace_id=trace_id,
                    is_followup=is_followup,
                    type="TEXT_TO_SQL",
                    response=api_results,
                    rephrased_question=rephrased_question,
                    intent_reasoning=intent_reasoning,
                    retrieved_tables=table_names,
                    sql_generation_reasoning=sql_generation_reasoning,
                )

            results["ask_result"] = api_results
            return results

        except Exception as e:
            logger.error(f"Error formatting cached response: {e}")
            return {
                "ask_result": {},
                "metadata": {
                    "type": "TEXT_TO_SQL",
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": request_from,
                },
            }

    def _format_response(
        self,
        *,
        query_id: str,
        api_results: Optional[List[AskResult]],
        error_message: Optional[str],
        invalid_sql: Optional[str],
        user_query: str,
        rephrased_question: Optional[str],
        intent_reasoning: Optional[str],
        table_names: List[str],
        sql_generation_reasoning: Optional[str],
        trace_id: Optional[str],
        is_followup: bool,
        request_from: str,
    ) -> dict:
        """
        General response formatter delegating to _format_final_response.
        Extracted to allow a single entry point for final formatting.
        """
        return self._format_final_response(
            query_id=query_id,
            api_results=api_results,
            error_message=error_message,
            invalid_sql=invalid_sql,
            user_query=user_query,
            rephrased_question=rephrased_question,
            intent_reasoning=intent_reasoning,
            table_names=table_names,
            sql_generation_reasoning=sql_generation_reasoning,
            trace_id=trace_id,
            is_followup=is_followup,
            request_from=request_from,
        )

    @observe(name="Ask Question")
    @trace_metadata
    async def ask(
        self,
        ask_request: AskRequest,
        **kwargs,
    ) -> dict:
        """
        Main ask method - rewritten with clean architecture

        Args:
            ask_request: Ask request object
            **kwargs: Additional metadata

        Returns:
            dict: Ask result with metadata
        """
        trace_id = kwargs.get("trace_id")
        query_id = ask_request.query_id

        # Create context for better organization
        context = AskContext(
            query_id=query_id,
            user_query=ask_request.query,
            project_id=ask_request.project_id,
            histories=ask_request.histories[: self._max_histories][::-1],
            configurations=ask_request.configurations or {},
            trace_id=trace_id,
        )

        # Initialize variables to avoid UnboundLocalError
        api_results = []
        invalid_sql = None
        error_message = None

        try:
            # Step 1: Initialize status
            if not self._is_stopped(query_id, self._ask_results):
                self._update_status(
                    query_id=query_id,
                    status="understanding",
                    trace_id=trace_id,
                    is_followup=bool(context.histories),
                )

            # Step 2: Check historical question (cache)
            cached_result = await self._check_historical_question(
                context.user_query, context.project_id
            )

            if cached_result[0] is not None:  # Cache hit
                return await self._handle_cache_hit(context, cached_result, ask_request)

            # Step 3: Classify intent
            intent_result = await self._classify_intent(
                context.user_query,
                context.histories,
                context.sql_samples or [],
                context.instructions or [],
                context.project_id,
                context.configurations,
            )
            context.rephrased_question = intent_result[1]
            context.intent_reasoning = intent_result[2]

            # Step 4: Handle general queries
            if intent_result[0] in ["GENERAL", "MISLEADING_QUERY", "USER_GUIDE"]:
                return self._handle_general_query(
                    query_id=context.query_id,
                    intent=intent_result[0],
                    user_query=context.user_query,
                    histories=context.histories,
                    db_schemas=intent_result[3],
                    language=context.configurations.model_dump().get("language", "en")
                    if hasattr(context.configurations, "model_dump")
                    else context.configurations.get("language", "en"),
                    custom_instruction=ask_request.custom_instruction,
                    rephrased_question=context.rephrased_question,
                    intent_reasoning=context.intent_reasoning,
                    trace_id=context.trace_id,
                    is_followup=bool(context.histories),
                )

            # Step 5: Retrieve database schemas
            try:
                schema_result = await self._retrieve_database_schemas(
                    context.query_id,
                    context.user_query,
                    context.histories,
                    context.project_id,
                    self._enable_column_pruning or ask_request.enable_column_pruning,
                    context.trace_id,
                    bool(context.histories),
                    context.rephrased_question,
                    context.intent_reasoning,
                )
                context.table_names = schema_result[0]
                context.table_ddls = schema_result[1]
                _retrieval_result = schema_result[2]
            except ValueError:
                # NO_RELEVANT_DATA error
                return {
                    "ask_result": {},
                    "metadata": {
                        "type": "TEXT_TO_SQL",
                        "error_type": "NO_RELEVANT_DATA",
                        "error_message": "",
                        "request_from": ask_request.request_from,
                    },
                }

            # Step 6: Generate SQL reasoning
            if (
                self._allow_sql_generation_reasoning
                and not ask_request.ignore_sql_generation_reasoning
            ):
                context.sql_generation_reasoning = await self._generate_sql_reasoning(
                    query_id=context.query_id,
                    user_query=context.user_query,
                    table_names=context.table_names,
                    table_ddls=context.table_ddls,
                    histories=context.histories,
                    sql_samples=context.sql_samples or [],
                    instructions=context.instructions or [],
                    configurations=context.configurations,
                    trace_id=context.trace_id,
                    is_followup=bool(context.histories),
                    rephrased_question=context.rephrased_question,
                    intent_reasoning=context.intent_reasoning,
                )

            # Step 7: Generate SQL
            if not self._is_stopped(query_id, self._ask_results):
                text_to_sql_generation_results = await self._generate_sql(
                    query_id=context.query_id,
                    user_query=context.user_query,
                    table_names=context.table_names,
                    table_ddls=context.table_ddls,
                    histories=context.histories,
                    project_id=context.project_id,
                    sql_generation_reasoning=context.sql_generation_reasoning,
                    sql_samples=context.sql_samples or [],
                    instructions=context.instructions or [],
                    retrieval_result=_retrieval_result,
                    allow_sql_functions_retrieval=self._allow_sql_functions_retrieval,
                    use_dry_plan=ask_request.use_dry_plan,
                    allow_dry_plan_fallback=ask_request.allow_dry_plan_fallback,
                    configurations=context.configurations,
                    trace_id=context.trace_id,
                    is_followup=bool(context.histories),
                    rephrased_question=context.rephrased_question,
                    intent_reasoning=context.intent_reasoning,
                )

                if sql_valid_result := text_to_sql_generation_results["post_process"][
                    "valid_generation_result"
                ]:
                    api_results = [
                        AskResult(
                            sql=sql_valid_result.get("sql"),
                            type="llm",
                        )
                    ]
                elif failed_dry_run_result := text_to_sql_generation_results[
                    "post_process"
                ]["invalid_generation_result"]:
                    api_results, invalid_sql, error_message = await self._correct_sql(
                        query_id=context.query_id,
                        user_query=context.user_query,
                        invalid_generation_result=failed_dry_run_result,
                        table_names=context.table_names,
                        table_ddls=context.table_ddls,
                        instructions=context.instructions or [],
                        project_id=context.project_id,
                        use_dry_plan=ask_request.use_dry_plan,
                        allow_dry_plan_fallback=ask_request.allow_dry_plan_fallback,
                        max_retries=self._max_sql_correction_retries,
                        trace_id=context.trace_id,
                        is_followup=bool(context.histories),
                        rephrased_question=context.rephrased_question,
                        intent_reasoning=context.intent_reasoning,
                    )
                else:
                    api_results = []
                    invalid_sql = None
                    error_message = None

            # Step 8: Format response
            return self._format_response(
                query_id=context.query_id,
                api_results=api_results,
                error_message=error_message,
                invalid_sql=invalid_sql,
                user_query=context.user_query,
                rephrased_question=context.rephrased_question,
                intent_reasoning=context.intent_reasoning,
                table_names=context.table_names,
                sql_generation_reasoning=context.sql_generation_reasoning,
                trace_id=context.trace_id,
                is_followup=bool(context.histories),
                request_from=ask_request.request_from,
            )

        except Exception as e:
            logger.exception(f"ask pipeline - OTHERS: {e}")

            self._update_status(
                query_id=query_id,
                status="failed",
                trace_id=trace_id,
                is_followup=bool(context.histories),
                type="TEXT_TO_SQL",
                error=AskError(
                    code="OTHERS",
                    message=str(e),
                ),
            )

            return {
                "ask_result": {},
                "metadata": {
                    "type": "TEXT_TO_SQL",
                    "error_type": "OTHERS",
                    "error_message": str(e),
                    "request_from": ask_request.request_from,
                },
            }

    async def _handle_cache_hit(
        self,
        context: AskContext,
        cached_result: Tuple[List[AskResult], str, List[dict], List[dict]],
        ask_request: AskRequest,
    ) -> dict:
        """Handle cache hit scenario"""
        api_results, sql_generation_reasoning, sql_samples, instructions = cached_result
        context.sql_generation_reasoning = sql_generation_reasoning
        context.sql_samples = sql_samples
        context.instructions = instructions

        if self._allow_intent_classification:
            intent_result = await self._classify_intent(
                context.user_query,
                context.histories,
                context.sql_samples or [],
                context.instructions or [],
                context.project_id,
                context.configurations,
            )
            context.rephrased_question = intent_result[1]
            context.intent_reasoning = intent_result[2]

            if context.rephrased_question:
                context.user_query = context.rephrased_question

            # Handle general queries
            if intent_result[0] in ["GENERAL", "MISLEADING_QUERY", "USER_GUIDE"]:
                return self._handle_general_query(
                    query_id=context.query_id,
                    intent=intent_result[0],
                    user_query=context.user_query,
                    histories=context.histories,
                    db_schemas=intent_result[3],
                    language=context.configurations.model_dump().get("language", "en")
                    if hasattr(context.configurations, "model_dump")
                    else context.configurations.get("language", "en"),
                    custom_instruction=ask_request.custom_instruction,
                    rephrased_question=context.rephrased_question,
                    intent_reasoning=context.intent_reasoning,
                    trace_id=context.trace_id,
                    is_followup=bool(context.histories),
                )

        return self._format_cached_response(
            context.query_id,
            api_results,
            context.rephrased_question,
            context.intent_reasoning,
            context.table_names or [],
            context.sql_generation_reasoning,
            context.trace_id,
            bool(context.histories),
            ask_request.request_from,
        )

    def stop_ask(
        self,
        stop_ask_request: StopAskRequest,
    ) -> None:
        """Stop ask request - clean implementation"""
        try:
            self._ask_results[stop_ask_request.query_id] = AskResultResponse(
                status="stopped",
            )
        except Exception as e:
            logger.error(f"Error stopping ask request: {e}")

    def get_ask_result(
        self,
        ask_result_request: AskResultRequest,
    ) -> AskResultResponse:
        """Get ask result - clean implementation"""
        try:
            result = self._ask_results.get(ask_result_request.query_id)

            if result is None:
                logger.exception(
                    f"ask pipeline - OTHERS: {ask_result_request.query_id} is not found"
                )
                return AskResultResponse(
                    status="failed",
                    type="TEXT_TO_SQL",
                    error=AskError(
                        code="OTHERS",
                        message=f"{ask_result_request.query_id} is not found",
                    ),
                )

            return result

        except Exception as e:
            logger.error(f"Error getting ask result: {e}")
            return AskResultResponse(
                status="failed",
                type="TEXT_TO_SQL",
                error=AskError(
                    code="OTHERS",
                    message=str(e),
                ),
            )

    async def get_ask_streaming_result(
        self,
        query_id: str,
    ):
        """Get ask streaming result - clean implementation"""
        try:
            result = self._ask_results.get(query_id)
            if not result:
                return

            _pipeline_name = ""
            if result.type == "GENERAL":
                if result.general_type == "USER_GUIDE":
                    _pipeline_name = "user_guide_assistance"
                elif result.general_type == "DATA_ASSISTANCE":
                    _pipeline_name = "data_assistance"
                elif result.general_type == "MISLEADING_QUERY":
                    _pipeline_name = "misleading_assistance"
            elif result.status == "planning":
                if result.is_followup:
                    _pipeline_name = "followup_sql_generation_reasoning"
                else:
                    _pipeline_name = "sql_generation_reasoning"

            if _pipeline_name:
                async for chunk in self._pipelines[
                    _pipeline_name
                ].get_streaming_results(query_id):
                    event = SSEEvent(
                        data=SSEEvent.SSEEventMessage(message=chunk),
                    )
                    yield event.serialize()

        except Exception as e:
            logger.error(f"Error getting ask streaming result: {e}")
            return
