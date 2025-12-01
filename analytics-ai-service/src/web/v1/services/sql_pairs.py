import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.pipelines.indexing.sql_pairs import SqlPair
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, MetadataTraceable

logger = logging.getLogger("analytics-service")


@dataclass
class SqlPairsContext:
    """Context for SQL pairs operations"""

    event_id: str
    project_id: str
    request_from: Literal["ui", "api"]
    trace_id: Optional[str] = None


class SqlPairsService:
    class Event(BaseModel, MetadataTraceable):
        """Event model for tracking SQL pairs operations"""

        class Error(BaseModel):
            """Error model for SQL pairs operations"""

            code: Literal["OTHERS"]
            message: str

        id: str
        status: Literal["indexing", "deleting", "finished", "failed"] = "indexing"
        error: Optional[Error] = None
        trace_id: Optional[str] = None
        request_from: Literal["ui", "api"] = "ui"

    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._cache: Dict[str, self.Event] = TTLCache(maxsize=maxsize, ttl=ttl)

    def _handle_exception(
        self,
        id: str,
        error_message: str,
        code: str = "OTHERS",
        trace_id: Optional[str] = None,
        request_from: Literal["ui", "api"] = "ui",
    ) -> None:
        """Handle exceptions and update event status"""
        try:
            self._cache[id] = self.Event(
                id=id,
                status="failed",
                error=self.Event.Error(code=code, message=error_message),
                trace_id=trace_id,
                request_from=request_from,
            )
            logger.error(f"SQL pairs operation failed for {id}: {error_message}")
        except Exception as e:
            logger.error(f"Failed to handle exception for {id}: {e}")

    class IndexRequest(BaseRequest):
        id: str
        sql_pairs: List[SqlPair]

    @observe(name="Prepare SQL Pairs")
    @trace_metadata
    async def index(
        self,
        request: IndexRequest,
        **kwargs,
    ):
        """Index SQL pairs - clean implementation"""
        logger.info(f"Request {request.id}: SQL Pairs Indexing process is running...")

        # Create context
        context = SqlPairsContext(
            event_id=request.id,
            project_id=request.project_id,
            request_from=request.request_from,
            trace_id=kwargs.get("trace_id"),
        )

        try:
            # Prepare input for pipeline
            input_data = {
                "mdl_str": '{"models": [{"properties": {"boilerplate": "sql_pairs"}}]}',
                "project_id": context.project_id,
                "external_pairs": {
                    "sql_pairs": [
                        sql_pair.model_dump() for sql_pair in request.sql_pairs
                    ],
                },
            }

            # Run indexing pipeline
            await self._pipelines["sql_pairs"].run(**input_data)

            # Update status to finished
            self._cache[context.event_id] = self.Event(
                id=context.event_id,
                status="finished",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        except Exception as e:
            self._handle_exception(
                context.event_id,
                f"An error occurred during SQL pairs indexing: {str(e)}",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        return self._cache[context.event_id].with_metadata()

    class DeleteRequest(BaseRequest):
        id: str
        sql_pair_ids: List[str]

    @observe(name="Delete SQL Pairs")
    @trace_metadata
    async def delete(
        self,
        request: DeleteRequest,
        **kwargs,
    ):
        """Delete SQL pairs - clean implementation"""
        logger.info(f"Request {request.id}: SQL Pairs Deletion process is running...")

        # Create context
        context = SqlPairsContext(
            event_id=request.id,
            project_id=request.project_id,
            request_from=request.request_from,
            trace_id=kwargs.get("trace_id"),
        )

        try:
            # Create SQL pair objects for deletion
            sql_pairs = [SqlPair(id=id) for id in request.sql_pair_ids]

            # Run cleanup pipeline
            await self._pipelines["sql_pairs"].clean(
                sql_pairs=sql_pairs, project_id=context.project_id
            )

            # Update status to finished
            self._cache[context.event_id] = self.Event(
                id=context.event_id,
                status="finished",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )
        except Exception as e:
            self._handle_exception(
                context.event_id,
                f"Failed to delete SQL pairs: {e}",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        return self._cache[context.event_id].with_metadata()

    def __getitem__(self, id: str) -> Event:
        """Get event by ID with error handling"""
        try:
            response = self._cache.get(id)
            if response is None:
                message = f"SQL Pairs Event with ID '{id}' not found."
                logger.warning(message)
                return self.Event(
                    id=id,
                    status="failed",
                    error=self.Event.Error(code="OTHERS", message=message),
                )
            return response
        except Exception as e:
            logger.error(f"Error getting event {id}: {e}")
            return self.Event(
                id=id,
                status="failed",
                error=self.Event.Error(code="OTHERS", message=str(e)),
            )

    def __setitem__(self, id: str, value: Event) -> None:
        """Set event by ID with error handling"""
        try:
            self._cache[id] = value
        except Exception as e:
            logger.error(f"Error setting event {id}: {e}")
            raise
