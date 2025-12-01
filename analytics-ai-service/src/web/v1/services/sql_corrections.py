import logging
from dataclasses import dataclass
from typing import List, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, MetadataTraceable

logger = logging.getLogger("analytics-service")


@dataclass
class SqlCorrectionContext:
    """Context for SQL correction operations"""

    event_id: str
    sql: str
    error: str
    project_id: str
    retrieved_tables: Optional[List[str]]
    use_dry_plan: bool
    allow_dry_plan_fallback: bool
    trace_id: Optional[str] = None
    request_from: Literal["ui", "api"] = "ui"


class SqlCorrectionService:
    class Error(BaseModel):
        """Error model for SQL correction response"""

        code: Literal["OTHERS"]
        message: str

    class Event(BaseModel, MetadataTraceable):
        """Event model for SQL correction response"""

        event_id: str
        status: Literal["correcting", "finished", "failed"] = "correcting"
        response: Optional[str] = None
        error: Optional["SqlCorrectionService.Error"] = None
        invalid_sql: Optional[str] = None
        trace_id: Optional[str] = None
        request_from: Literal["ui", "api"] = "ui"

    def __init__(
        self,
        pipelines: dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._cache: dict[str, self.Event] = TTLCache(maxsize=maxsize, ttl=ttl)

    def _handle_exception(
        self,
        context: SqlCorrectionContext,
        error_message: str,
        code: str = "OTHERS",
        invalid_sql: Optional[str] = None,
    ) -> None:
        """Handle exceptions with proper error logging and status update"""
        try:
            self._cache[context.event_id] = self.Event(
                event_id=context.event_id,
                status="failed",
                error=self.Error(code=code, message=error_message),
                trace_id=context.trace_id,
                invalid_sql=invalid_sql,
                request_from=context.request_from,
            )
            logger.error(
                f"SQL correction failed for {context.event_id}: {error_message}"
            )
        except Exception as e:
            logger.error(f"Error handling exception for {context.event_id}: {e}")

    async def _extract_tables(self, context: SqlCorrectionContext) -> List[str]:
        """Extract tables from SQL with error handling"""
        try:
            if context.retrieved_tables:
                return context.retrieved_tables

            result = await self._pipelines["sql_tables_extraction"].run(
                sql=context.sql,
            )
            return result["post_process"]
        except Exception as e:
            logger.error(f"Error extracting tables: {e}")
            raise

    async def _retrieve_schema(
        self, context: SqlCorrectionContext, tables: List[str]
    ) -> List[str]:
        """Retrieve database schema for tables with error handling"""
        try:
            result = await self._pipelines["db_schema_retrieval"].run(
                project_id=context.project_id,
                tables=tables,
            )
            documents = result.get("construct_retrieval_results", {}).get(
                "retrieval_results", []
            )
            return [document.get("table_ddl") for document in documents]
        except Exception as e:
            logger.error(f"Error retrieving schema: {e}")
            raise

    async def _correct_sql(
        self, context: SqlCorrectionContext, table_ddls: List[str], invalid_data: dict
    ) -> dict:
        """Correct SQL using pipeline with error handling"""
        try:
            return await self._pipelines["sql_correction"].run(
                contexts=table_ddls,
                invalid_generation_result=invalid_data,
                project_id=context.project_id,
                use_dry_plan=context.use_dry_plan,
                allow_dry_plan_fallback=context.allow_dry_plan_fallback,
            )
        except Exception as e:
            logger.error(f"Error correcting SQL: {e}")
            raise

    def _update_success_status(
        self, context: SqlCorrectionContext, corrected_sql: str
    ) -> None:
        """Update cache with successful result"""
        try:
            self._cache[context.event_id] = self.Event(
                event_id=context.event_id,
                status="finished",
                trace_id=context.trace_id,
                response=corrected_sql,
                request_from=context.request_from,
            )
        except Exception as e:
            logger.error(f"Error updating success status for {context.event_id}: {e}")

    class CorrectionRequest(BaseRequest):
        event_id: str
        sql: str
        error: str
        retrieved_tables: Optional[List[str]] = None
        use_dry_plan: bool = False
        allow_dry_plan_fallback: bool = True

    @observe(name="SQL Correction")
    @trace_metadata
    async def correct(
        self,
        request: CorrectionRequest,
        **kwargs,
    ):
        """Correct SQL - clean implementation"""
        logger.info(f"Request {request.event_id}: SQL Correction process is running...")
        trace_id = kwargs.get("trace_id")

        # Create context for better organization
        context = SqlCorrectionContext(
            event_id=request.event_id,
            sql=request.sql,
            error=request.error,
            project_id=request.project_id,
            retrieved_tables=request.retrieved_tables,
            use_dry_plan=request.use_dry_plan,
            allow_dry_plan_fallback=request.allow_dry_plan_fallback,
            trace_id=trace_id,
            request_from=request.request_from,
        )

        try:
            # Step 1: Prepare invalid data
            invalid_data = {
                "sql": context.sql,
                "error": context.error,
            }

            # Step 2: Extract tables if not provided
            tables = await self._extract_tables(context)

            # Step 3: Retrieve database schema
            table_ddls = await self._retrieve_schema(context, tables)

            # Step 4: Correct SQL
            result = await self._correct_sql(context, table_ddls, invalid_data)

            # Step 5: Process results
            post_process = result["post_process"]
            valid = post_process["valid_generation_result"]
            invalid = post_process["invalid_generation_result"]

            if not valid:
                error_message = invalid["error"]
                self._handle_exception(
                    context,
                    f"An error occurred during SQL correction: {error_message}",
                    invalid_sql=invalid["sql"],
                )
            else:
                corrected_sql = valid["sql"]
                self._update_success_status(context, corrected_sql)

        except Exception as e:
            self._handle_exception(
                context,
                f"An error occurred during SQL correction: {str(e)}",
            )

        return self._cache[context.event_id].with_metadata()

    def __getitem__(self, event_id: str) -> Event:
        """Get SQL correction event by ID with error handling"""
        try:
            response = self._cache.get(event_id)

            if response is None:
                message = f"SQL Correction Event with ID '{event_id}' not found."
                logger.warning(message)
                return self.Event(
                    event_id=event_id,
                    status="failed",
                    error=self.Error(code="OTHERS", message=message),
                )

            return response
        except Exception as e:
            logger.error(f"Error getting SQL correction event {event_id}: {e}")
            return self.Event(
                event_id=event_id,
                status="failed",
                error=self.Error(code="OTHERS", message=str(e)),
            )

    def __setitem__(self, event_id: str, value: Event) -> None:
        """Set SQL correction event with error handling"""
        try:
            self._cache[event_id] = value
        except Exception as e:
            logger.error(f"Error setting SQL correction event {event_id}: {e}")
