import logging
from dataclasses import dataclass
from typing import Dict, List, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.pipelines.indexing.instructions import Instruction
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, MetadataTraceable

logger = logging.getLogger("analytics-service")


@dataclass
class InstructionsContext:
    """Context for instructions operations"""

    event_id: str
    project_id: str
    request_from: Literal["ui", "api"]
    trace_id: Optional[str] = None


class InstructionsService:
    class Instruction(BaseModel):
        """Instruction model for indexing"""

        id: str
        instruction: str
        questions: List[str]
        # This is used to identify the default instruction needed to be retrieved for the project
        is_default: bool = False
        scope: Literal["sql", "answer", "chart"] = "sql"

    class Error(BaseModel):
        """Error model for instructions operations"""

        code: Literal["OTHERS"]
        message: str

    class Event(BaseModel, MetadataTraceable):
        """Event model for tracking instructions operations"""

        event_id: str
        status: Literal["indexing", "deleting", "finished", "failed"] = "indexing"
        error: Optional["InstructionsService.Error"] = None
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
                event_id=id,
                status="failed",
                error=self.Error(code=code, message=error_message),
                trace_id=trace_id,
                request_from=request_from,
            )
            logger.error(f"Instructions operation failed for {id}: {error_message}")
        except Exception as e:
            logger.error(f"Failed to handle exception for {id}: {e}")

    def _process_instructions(
        self, instructions: List["InstructionsService.Instruction"]
    ) -> List[Instruction]:
        """Process instructions for indexing"""
        try:
            processed_instructions = []
            for instruction in instructions:
                if instruction.is_default:
                    processed_instructions.append(
                        Instruction(
                            id=instruction.id,
                            instruction=instruction.instruction,
                            question="",
                            is_default=True,
                            scope=instruction.scope,
                        )
                    )
                else:
                    for question in instruction.questions:
                        processed_instructions.append(
                            Instruction(
                                id=instruction.id,
                                instruction=instruction.instruction,
                                question=question,
                                is_default=False,
                                scope=instruction.scope,
                            )
                        )
            return processed_instructions
        except Exception as e:
            logger.error(f"Error processing instructions: {e}")
            raise

    class IndexRequest(BaseRequest):
        event_id: str
        instructions: List["InstructionsService.Instruction"]

    @observe(name="Index Instructions")
    @trace_metadata
    async def index(
        self,
        request: IndexRequest,
        **kwargs,
    ):
        """Index instructions - clean implementation"""
        logger.info(
            f"Request {request.event_id}: Instructions Indexing process is running..."
        )

        # Create context
        context = InstructionsContext(
            event_id=request.event_id,
            project_id=request.project_id,
            request_from=request.request_from,
            trace_id=kwargs.get("trace_id"),
        )

        try:
            # Process instructions
            processed_instructions = self._process_instructions(request.instructions)

            # Run indexing pipeline
            await self._pipelines["instructions_indexing"].run(
                project_id=context.project_id,
                instructions=processed_instructions,
            )

            # Update status to finished
            self._cache[context.event_id] = self.Event(
                event_id=context.event_id,
                status="finished",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        except Exception as e:
            self._handle_exception(
                context.event_id,
                f"An error occurred during instructions indexing: {str(e)}",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        return self._cache[context.event_id].with_metadata()

    class DeleteRequest(BaseRequest):
        event_id: str
        instruction_ids: List[str]

    @observe(name="Delete Instructions")
    @trace_metadata
    async def delete(
        self,
        request: DeleteRequest,
        **kwargs,
    ):
        """Delete instructions - clean implementation"""
        logger.info(
            f"Request {request.event_id}: Instructions Deletion process is running..."
        )

        # Create context
        context = InstructionsContext(
            event_id=request.event_id,
            project_id=request.project_id,
            request_from=request.request_from,
            trace_id=kwargs.get("trace_id"),
        )

        try:
            # Create instruction objects for deletion
            instructions = [Instruction(id=id) for id in request.instruction_ids]

            # Run cleanup pipeline
            await self._pipelines["instructions_indexing"].clean(
                instructions=instructions, project_id=context.project_id
            )

            # Update status to finished
            self._cache[context.event_id] = self.Event(
                event_id=context.event_id,
                status="finished",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )
        except Exception as e:
            self._handle_exception(
                context.event_id,
                f"Failed to delete instructions: {e}",
                trace_id=context.trace_id,
                request_from=context.request_from,
            )

        return self._cache[context.event_id].with_metadata()

    def __getitem__(self, event_id: str) -> Event:
        """Get event by ID with error handling"""
        try:
            response = self._cache.get(event_id)
            if response is None:
                message = f"Instructions Event with ID '{event_id}' not found."
                logger.warning(message)
                return self.Event(
                    event_id=event_id,
                    status="failed",
                    error=self.Error(code="OTHERS", message=message),
                )
            return response
        except Exception as e:
            logger.error(f"Error getting event {event_id}: {e}")
            return self.Event(
                event_id=event_id,
                status="failed",
                error=self.Error(code="OTHERS", message=str(e)),
            )

    def __setitem__(self, event_id: str, value: Event) -> None:
        """Set event by ID with error handling"""
        try:
            self._cache[event_id] = value
        except Exception as e:
            logger.error(f"Error setting event {event_id}: {e}")
            raise
