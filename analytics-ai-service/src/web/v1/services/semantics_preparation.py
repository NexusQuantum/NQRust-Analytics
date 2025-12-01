import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import AliasChoices, BaseModel, Field

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest

logger = logging.getLogger("analytics-service")


@dataclass
class SemanticsPreparationContext:
    """Context for semantics preparation operations"""

    mdl_hash: str
    mdl: str
    project_id: str
    configurations: dict
    trace_id: Optional[str] = None
    request_from: Literal["ui", "api"] = "ui"


# POST /v1/semantics-preparations
class SemanticsPreparationRequest(BaseRequest):
    """Request model for semantics preparation endpoint"""

    mdl: str
    # don't recommend to use id as a field name, but it's used in the API spec
    # so we need to support as a choice, and will remove it in the future
    mdl_hash: str = Field(validation_alias=AliasChoices("mdl_hash", "id"))


class SemanticsPreparationResponse(BaseModel):
    """Response model for semantics preparation endpoint"""

    # don't recommend to use id as a field name, but it's used in the API spec
    # so we need to support as a choice, and will remove it in the future
    mdl_hash: str = Field(serialization_alias="id")


# GET /v1/semantics-preparations/{mdl_hash}/status
class SemanticsPreparationStatusRequest(BaseModel):
    """Request model for getting semantics preparation status"""

    # don't recommend to use id as a field name, but it's used in the API spec
    # so we need to support as a choice, and will remove it in the future
    mdl_hash: str = Field(validation_alias=AliasChoices("mdl_hash", "id"))


class SemanticsPreparationStatusResponse(BaseModel):
    """Response model for semantics preparation status"""

    class SemanticsPreparationError(BaseModel):
        """Error model for semantics preparation response"""

        code: Literal["OTHERS"]
        message: str

    status: Literal["indexing", "finished", "failed"]
    error: Optional[SemanticsPreparationError] = None


class SemanticsPreparationService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._prepare_semantics_statuses: Dict[
            str, SemanticsPreparationStatusResponse
        ] = TTLCache(maxsize=maxsize, ttl=ttl)

    def _handle_exception(
        self,
        context: SemanticsPreparationContext,
        error_message: str,
        code: str = "OTHERS",
    ) -> None:
        """Handle exceptions with proper error logging and status update"""
        try:
            self._prepare_semantics_statuses[
                context.mdl_hash
            ] = SemanticsPreparationStatusResponse(
                status="failed",
                error=SemanticsPreparationStatusResponse.SemanticsPreparationError(
                    code=code,
                    message=error_message,
                ),
            )
            logger.error(
                f"Semantics preparation failed for {context.mdl_hash}: {error_message}"
            )
        except Exception as e:
            logger.error(f"Error handling exception for {context.mdl_hash}: {e}")

    async def _run_preparation_tasks(
        self, context: SemanticsPreparationContext
    ) -> None:
        """Run all preparation tasks in parallel with error handling"""
        try:
            input_data = {
                "mdl_str": context.mdl,
                "project_id": context.project_id,
            }

            tasks = [
                self._pipelines[name].run(**input_data)
                for name in [
                    "db_schema",
                    "historical_question",
                    "table_description",
                    "sql_pairs",
                    "project_meta",
                ]
            ]

            await asyncio.gather(*tasks)
        except Exception as e:
            logger.error(f"Error running preparation tasks: {e}")
            raise

    def _update_success_status(self, context: SemanticsPreparationContext) -> None:
        """Update cache with successful result"""
        try:
            self._prepare_semantics_statuses[
                context.mdl_hash
            ] = SemanticsPreparationStatusResponse(
                status="finished",
            )
        except Exception as e:
            logger.error(f"Error updating success status for {context.mdl_hash}: {e}")

    @observe(name="Prepare Semantics")
    @trace_metadata
    async def prepare_semantics(
        self,
        prepare_semantics_request: SemanticsPreparationRequest,
        **kwargs,
    ):
        """Prepare semantics - clean implementation"""
        trace_id = kwargs.get("trace_id")

        # Create context for better organization
        context = SemanticsPreparationContext(
            mdl_hash=prepare_semantics_request.mdl_hash,
            mdl=prepare_semantics_request.mdl,
            project_id=prepare_semantics_request.project_id,
            configurations=prepare_semantics_request.configurations.model_dump()
            if prepare_semantics_request.configurations
            else {},
            trace_id=trace_id,
            request_from=prepare_semantics_request.request_from,
        )

        results = {
            "metadata": {
                "error_type": "",
                "error_message": "",
                "request_from": context.request_from,
            },
        }

        try:
            logger.info(f"MDL: {context.mdl}")

            # Step 1: Run preparation tasks
            await self._run_preparation_tasks(context)

            # Step 2: Update success status
            self._update_success_status(context)

        except Exception as e:
            logger.error(f"Failed to prepare semantics: {e}")

            self._handle_exception(
                context,
                f"Failed to prepare semantics: {e}",
            )

            results["metadata"]["error_type"] = "INDEXING_FAILED"
            results["metadata"]["error_message"] = str(e)

        return results

    def get_prepare_semantics_status(
        self, prepare_semantics_status_request: SemanticsPreparationStatusRequest
    ) -> SemanticsPreparationStatusResponse:
        """Get semantics preparation status - clean implementation"""
        try:
            result = self._prepare_semantics_statuses.get(
                prepare_semantics_status_request.mdl_hash
            )

            if result is None:
                logger.warning(
                    f"Semantics preparation status not found: {prepare_semantics_status_request.mdl_hash}"
                )
                return SemanticsPreparationStatusResponse(
                    status="failed",
                    error=SemanticsPreparationStatusResponse.SemanticsPreparationError(
                        code="OTHERS",
                        message=f"{prepare_semantics_status_request.mdl_hash} is not found",
                    ),
                )

            return result
        except Exception as e:
            logger.error(f"Error getting semantics preparation status: {e}")
            return SemanticsPreparationStatusResponse(
                status="failed",
                error=SemanticsPreparationStatusResponse.SemanticsPreparationError(
                    code="OTHERS",
                    message=str(e),
                ),
            )

    @observe(name="Delete Semantics Documents")
    @trace_metadata
    async def delete_semantics(self, project_id: str, **kwargs):
        """Delete semantics documents - clean implementation"""
        logger.info(f"Project ID: {project_id}, Deleting semantics documents...")

        try:
            # Create tasks for different pipeline types
            regular_tasks = [
                self._pipelines[name].clean(project_id=project_id)
                for name in [
                    "db_schema",
                    "historical_question",
                    "table_description",
                    "project_meta",
                ]
            ]

            delete_all_tasks = [
                self._pipelines[name].clean(
                    project_id=project_id,
                    delete_all=True,
                )
                for name in ["sql_pairs", "instructions"]
            ]

            # Run all tasks in parallel
            await asyncio.gather(*regular_tasks, *delete_all_tasks)

        except Exception as e:
            logger.error(f"Error deleting semantics documents: {e}")
            raise
