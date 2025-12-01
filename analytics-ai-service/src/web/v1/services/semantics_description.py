import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

import orjson
from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest, MetadataTraceable

logger = logging.getLogger("analytics-service")


@dataclass
class SemanticsDescriptionContext:
    """Context for semantics description operations"""

    id: str
    selected_models: list[str]
    user_prompt: str
    mdl: str
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None
    request_from: Literal["ui", "api"] = "ui"


class SemanticsDescription:
    class Resource(BaseModel, MetadataTraceable):
        """Resource model for semantics description response"""

        class Error(BaseModel):
            """Error model for semantics description response"""

            code: Literal["OTHERS", "MDL_PARSE_ERROR", "RESOURCE_NOT_FOUND"]
            message: str

        id: str
        status: Literal["generating", "finished", "failed"] = "generating"
        response: Optional[dict] = None
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
        self._cache: Dict[str, self.Resource] = TTLCache(maxsize=maxsize, ttl=ttl)

    def _handle_exception(
        self,
        context: SemanticsDescriptionContext,
        error_message: str,
        code: str = "OTHERS",
    ) -> None:
        """Handle exceptions with proper error logging and status update"""
        try:
            self[context.id] = self.Resource(
                id=context.id,
                status="failed",
                error=self.Resource.Error(code=code, message=error_message),
                trace_id=context.trace_id,
                request_from=context.request_from,
            )
            logger.error(
                f"Semantics description failed for {context.id}: {error_message}"
            )
        except Exception as e:
            logger.error(f"Error handling exception for {context.id}: {e}")

    async def _parse_mdl(self, context: SemanticsDescriptionContext) -> dict:
        """Parse MDL string to dictionary with error handling"""
        try:
            return orjson.loads(context.mdl)
        except orjson.JSONDecodeError as e:
            self._handle_exception(
                context,
                f"Failed to parse MDL: {str(e)}",
                code="MDL_PARSE_ERROR",
            )
            raise

    def _create_chunks(
        self, context: SemanticsDescriptionContext, mdl_dict: dict, chunk_size: int = 50
    ) -> list[dict]:
        """Create chunks for processing with error handling"""
        try:
            template = {
                "user_prompt": context.user_prompt,
                "language": context.configurations.get("language", "en"),
            }

            chunks = [
                {
                    **model,
                    "columns": model["columns"][i : i + chunk_size],
                }
                for model in mdl_dict["models"]
                if model["name"] in context.selected_models
                for i in range(0, len(model["columns"]), chunk_size)
            ]

            return [
                {
                    **template,
                    "mdl": {"models": [chunk]},
                    "selected_models": [chunk["name"]],
                }
                for chunk in chunks
            ]
        except Exception as e:
            logger.error(f"Error creating chunks: {e}")
            raise

    async def _process_chunk(
        self, context: SemanticsDescriptionContext, chunk: dict
    ) -> None:
        """Process a single chunk with error handling"""
        try:
            resp = await self._pipelines["semantics_description"].run(**chunk)
            output = resp.get("output")

            current = self[context.id]
            current.response = current.response or {}

            for key in output.keys():
                if key not in current.response:
                    current.response[key] = output[key]
                    continue

                current.response[key]["columns"].extend(output[key]["columns"])
        except Exception as e:
            logger.error(f"Error processing chunk: {e}")
            raise

    def _update_success_status(self, context: SemanticsDescriptionContext) -> None:
        """Update cache with successful result"""
        try:
            self[context.id].status = "finished"
            self[context.id].trace_id = context.trace_id
            self[context.id].request_from = context.request_from
        except Exception as e:
            logger.error(f"Error updating success status for {context.id}: {e}")

    class GenerateRequest(BaseRequest):
        id: str
        selected_models: list[str]
        user_prompt: str
        mdl: str

    def _chunking(
        self, mdl_dict: dict, request: GenerateRequest, chunk_size: int = 50
    ) -> list[dict]:
        template = {
            "user_prompt": request.user_prompt,
            "language": request.configurations.language,
        }

        chunks = [
            {
                **model,
                "columns": model["columns"][i : i + chunk_size],
            }
            for model in mdl_dict["models"]
            if model["name"] in request.selected_models
            for i in range(0, len(model["columns"]), chunk_size)
        ]

        return [
            {
                **template,
                "mdl": {"models": [chunk]},
                "selected_models": [chunk["name"]],
            }
            for chunk in chunks
        ]

    async def _generate_task(self, request_id: str, chunk: dict):
        resp = await self._pipelines["semantics_description"].run(**chunk)
        output = resp.get("output")

        current = self[request_id]
        current.response = current.response or {}

        for key in output.keys():
            if key not in current.response:
                current.response[key] = output[key]
                continue

            current.response[key]["columns"].extend(output[key]["columns"])

    @observe(name="Generate Semantics Description")
    @trace_metadata
    async def generate(self, request: GenerateRequest, **kwargs) -> Resource:
        """Generate semantics description - clean implementation"""
        logger.info("Generate Semantics Description pipeline is running...")
        trace_id = kwargs.get("trace_id")

        # Create context for better organization
        context = SemanticsDescriptionContext(
            id=request.id,
            selected_models=request.selected_models,
            user_prompt=request.user_prompt,
            mdl=request.mdl,
            project_id=request.project_id,
            configurations=request.configurations.model_dump()
            if request.configurations
            else {},
            trace_id=trace_id,
            request_from=request.request_from,
        )

        try:
            # Step 1: Parse MDL
            mdl_dict = await self._parse_mdl(context)

            # Step 2: Create chunks
            chunks = self._create_chunks(context, mdl_dict)

            # Step 3: Process chunks in parallel
            tasks = [self._process_chunk(context, chunk) for chunk in chunks]
            await asyncio.gather(*tasks)

            # Step 4: Update success status
            self._update_success_status(context)

        except orjson.JSONDecodeError:
            # Already handled in _parse_mdl
            pass
        except Exception as e:
            self._handle_exception(
                context,
                f"An error occurred during semantics description generation: {str(e)}",
            )

        return self[context.id].with_metadata()

    def __getitem__(self, id: str) -> Resource:
        """Get semantics description resource by ID with error handling"""
        try:
            response = self._cache.get(id)

            if response is None:
                message = f"Semantics Description Resource with ID '{id}' not found."
                logger.warning(message)
                return self.Resource(
                    id=id,
                    status="failed",
                    error=self.Resource.Error(
                        code="RESOURCE_NOT_FOUND", message=message
                    ),
                )

            return response
        except Exception as e:
            logger.error(f"Error getting semantics description resource {id}: {e}")
            return self.Resource(
                id=id,
                status="failed",
                error=self.Resource.Error(code="OTHERS", message=str(e)),
            )

    def __setitem__(self, id: str, value: Resource) -> None:
        """Set semantics description resource with error handling"""
        try:
            self._cache[id] = value
        except Exception as e:
            logger.error(f"Error setting semantics description resource {id}: {e}")
