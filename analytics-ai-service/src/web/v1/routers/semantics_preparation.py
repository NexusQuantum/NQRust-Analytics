import logging
from dataclasses import asdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services.semantics_preparation import (
    SemanticsPreparationRequest,
    SemanticsPreparationResponse,
    SemanticsPreparationStatusRequest,
    SemanticsPreparationStatusResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/semantics-preparations")
async def prepare_semantics(
    prepare_semantics_request: SemanticsPreparationRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> SemanticsPreparationResponse:
    """
    Prepare semantics - clean implementation

    Args:
        prepare_semantics_request: Semantics preparation request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        SemanticsPreparationResponse: Response with MDL hash

    Raises:
        HTTPException: If request processing fails
    """
    try:
        # Initialize status in cache
        service_container.semantics_preparation_service._prepare_semantics_statuses[
            prepare_semantics_request.mdl_hash
        ] = SemanticsPreparationStatusResponse(
            status="indexing",
        )

        # Add background task
        background_tasks.add_task(
            service_container.semantics_preparation_service.prepare_semantics,
            prepare_semantics_request,
            service_metadata=asdict(service_metadata),
        )

        return SemanticsPreparationResponse(mdl_hash=prepare_semantics_request.mdl_hash)

    except Exception as e:
        logger.error(f"Error creating semantics preparation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/semantics-preparations/{mdl_hash}/status")
async def get_prepare_semantics_status(
    mdl_hash: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> SemanticsPreparationStatusResponse:
    """
    Get semantics preparation status - clean implementation

    Args:
        mdl_hash: MDL hash identifier
        service_container: Service container dependency

    Returns:
        SemanticsPreparationStatusResponse: Preparation status

    Raises:
        HTTPException: If status not found or processing fails
    """
    try:
        return service_container.semantics_preparation_service.get_prepare_semantics_status(
            SemanticsPreparationStatusRequest(mdl_hash=mdl_hash)
        )
    except KeyError:
        logger.warning(f"Semantics preparation status not found: {mdl_hash}")
        raise HTTPException(
            status_code=404, detail="Semantics preparation status not found"
        )
    except Exception as e:
        logger.error(f"Error getting semantics preparation status: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/semantics")
async def delete_semantics(
    project_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> None:
    """
    Delete semantics documents - clean implementation

    Args:
        project_id: Project identifier
        service_container: Service container dependency

    Returns:
        None

    Raises:
        HTTPException: If project_id is missing or processing fails
    """
    try:
        if not project_id:
            raise HTTPException(status_code=400, detail="Project ID is required")

        await service_container.semantics_preparation_service.delete_semantics(
            project_id
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting semantics documents: {e}")
        raise HTTPException(status_code=500, detail=str(e))
