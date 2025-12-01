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
class RelationshipRecommendationContext:
    """Context for relationship recommendation operations"""

    id: str
    mdl: str
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None
    request_from: Literal["ui", "api"] = "ui"


class RelationshipRecommendation:
    class Input(BaseRequest):
        """Input model for relationship recommendation request"""

        id: str
        mdl: str

    class Resource(BaseModel, MetadataTraceable):
        """Resource model for relationship recommendation response"""

        class Error(BaseModel):
            """Error model for relationship recommendation response"""

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
        self._cache: Dict[str, RelationshipRecommendation.Resource] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    def _handle_exception(
        self,
        context: RelationshipRecommendationContext,
        error_message: str,
        code: str = "OTHERS",
    ) -> None:
        """Handle exceptions with proper error logging and status update"""
        try:
            self._cache[context.id] = self.Resource(
                id=context.id,
                status="failed",
                error=self.Resource.Error(code=code, message=error_message),
                trace_id=context.trace_id,
                request_from=context.request_from,
            )
            logger.error(
                f"Relationship recommendation failed for {context.id}: {error_message}"
            )
        except Exception as e:
            logger.error(f"Error handling exception for {context.id}: {e}")

    async def _parse_mdl(self, context: RelationshipRecommendationContext) -> dict:
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

    async def _generate_recommendation(
        self, context: RelationshipRecommendationContext, mdl_dict: dict
    ) -> dict:
        """Generate relationship recommendation using pipeline"""
        try:
            input_data = {
                "mdl": mdl_dict,
                "language": context.configurations.get("language", "en"),
            }
            return await self._pipelines["relationship_recommendation"].run(
                **input_data
            )
        except Exception as e:
            logger.error(f"Error generating relationship recommendation: {e}")
            raise

    def _update_success_status(
        self, context: RelationshipRecommendationContext, response: dict
    ) -> None:
        """Update cache with successful result"""
        try:
            self._cache[context.id] = self.Resource(
                id=context.id,
                status="finished",
                response=response.get("validated"),
                trace_id=context.trace_id,
                request_from=context.request_from,
            )
        except Exception as e:
            logger.error(f"Error updating success status for {context.id}: {e}")

    @observe(name="Generate Relationship Recommendation")
    @trace_metadata
    async def recommend(self, request: Input, **kwargs) -> Resource:
        """Generate relationship recommendation - clean implementation"""
        logger.info("Generate Relationship Recommendation pipeline is running...")
        trace_id = kwargs.get("trace_id")

        # Create context for better organization
        context = RelationshipRecommendationContext(
            id=request.id,
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

            # Step 2: Generate recommendation
            response = await self._generate_recommendation(context, mdl_dict)

            # Step 3: Update success status
            self._update_success_status(context, response)

        except orjson.JSONDecodeError:
            # Already handled in _parse_mdl
            pass
        except Exception as e:
            self._handle_exception(
                context,
                f"An error occurred during relationship recommendation generation: {str(e)}",
            )

        return self._cache[context.id].with_metadata()

    def __getitem__(self, id: str) -> Resource:
        """Get relationship recommendation resource by ID with error handling"""
        try:
            response = self._cache.get(id)

            if response is None:
                message = (
                    f"Relationship Recommendation Resource with ID '{id}' not found."
                )
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
            logger.error(
                f"Error getting relationship recommendation resource {id}: {e}"
            )
            return self.Resource(
                id=id,
                status="failed",
                error=self.Resource.Error(code="OTHERS", message=str(e)),
            )

    def __setitem__(self, id: str, value: Resource) -> None:
        """Set relationship recommendation resource with error handling"""
        try:
            self._cache[id] = value
        except Exception as e:
            logger.error(
                f"Error setting relationship recommendation resource {id}: {e}"
            )
