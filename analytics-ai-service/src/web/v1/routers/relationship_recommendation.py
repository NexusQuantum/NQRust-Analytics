import logging
import uuid
from dataclasses import asdict
from typing import Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services import BaseRequest, RelationshipRecommendation

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for relationship recommendation endpoint"""

    mdl: str


class PostResponse(BaseModel):
    """Response model for relationship recommendation endpoint"""

    id: str


@router.post(
    "/relationship-recommendations",
    response_model=PostResponse,
)
async def recommend(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Create relationship recommendation request - clean implementation

    Args:
        request: Relationship recommendation request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        PostResponse: Response with recommendation ID

    Raises:
        HTTPException: If request processing fails
    """
    try:
        id = str(uuid.uuid4())
        service = service_container.relationship_recommendation

        # Initialize resource
        service[id] = RelationshipRecommendation.Resource(id=id)

        # Create input
        input = RelationshipRecommendation.Input(
            id=id,
            mdl=request.mdl,
            project_id=request.project_id,
            configuration=request.configurations,
        )

        # Add background task
        background_tasks.add_task(
            service.recommend, input, service_metadata=asdict(service_metadata)
        )

        return PostResponse(id=id)

    except Exception as e:
        logger.error(f"Error creating relationship recommendation request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting relationship recommendation result"""

    id: str
    status: Literal["generating", "finished", "failed"]
    response: Optional[dict]
    error: Optional[dict]
    trace_id: Optional[str] = None


@router.get(
    "/relationship-recommendations/{id}",
    response_model=GetResponse,
)
async def get(
    id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get relationship recommendation result - clean implementation

    Args:
        id: Recommendation identifier
        service_container: Service container dependency

    Returns:
        GetResponse: Relationship recommendation result

    Raises:
        HTTPException: If recommendation not found or processing fails
    """
    try:
        resource = service_container.relationship_recommendation[id]

        return GetResponse(
            id=resource.id,
            status=resource.status,
            response=resource.response,
            error=resource.error and resource.error.model_dump(),
            trace_id=resource.trace_id,
        )
    except KeyError:
        logger.warning(f"Relationship recommendation not found: {id}")
        raise HTTPException(
            status_code=404, detail="Relationship recommendation not found"
        )
    except Exception as e:
        logger.error(f"Error getting relationship recommendation result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
