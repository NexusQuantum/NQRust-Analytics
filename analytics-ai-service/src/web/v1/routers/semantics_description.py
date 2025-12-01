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
from src.web.v1.services import BaseRequest, SemanticsDescription

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for semantics description endpoint"""

    selected_models: list[str]
    user_prompt: str
    mdl: str


class PostResponse(BaseModel):
    """Response model for semantics description endpoint"""

    id: str


@router.post(
    "/semantics-descriptions",
    response_model=PostResponse,
)
async def generate(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Generate semantics description - clean implementation

    Args:
        request: Semantics description request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        PostResponse: Response with description ID

    Raises:
        HTTPException: If request processing fails
    """
    try:
        id = str(uuid.uuid4())
        service = service_container.semantics_description

        # Initialize resource
        service[id] = SemanticsDescription.Resource(id=id)

        # Create generate request
        generate_request = SemanticsDescription.GenerateRequest(
            id=id, **request.model_dump()
        )

        # Add background task
        background_tasks.add_task(
            service.generate,
            generate_request,
            service_metadata=asdict(service_metadata),
        )

        return PostResponse(id=id)

    except Exception as e:
        logger.error(f"Error creating semantics description request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting semantics description result"""

    id: str
    status: Literal["generating", "finished", "failed"]
    response: Optional[list[dict]]
    error: Optional[dict]
    trace_id: Optional[str] = None


@router.get(
    "/semantics-descriptions/{id}",
    response_model=GetResponse,
)
async def get(
    id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get semantics description result - clean implementation

    Args:
        id: Description identifier
        service_container: Service container dependency

    Returns:
        GetResponse: Semantics description result

    Raises:
        HTTPException: If description not found or processing fails
    """
    try:
        resource = service_container.semantics_description[id]

        def _formatter(response: Optional[dict]) -> Optional[list[dict]]:
            """Format response data for client consumption"""
            if response is None:
                return None

            return [
                {
                    "name": model_name,
                    "columns": [
                        {
                            "name": column["name"],
                            "description": column["properties"].get("description", ""),
                        }
                        for column in model_data["columns"]
                    ],
                    "description": model_data["properties"].get("description", ""),
                }
                for model_name, model_data in response.items()
            ]

        return GetResponse(
            id=resource.id,
            status=resource.status,
            response=resource.response and _formatter(resource.response),
            error=resource.error and resource.error.model_dump(),
            trace_id=resource.trace_id,
        )
    except KeyError:
        logger.warning(f"Semantics description not found: {id}")
        raise HTTPException(status_code=404, detail="Semantics description not found")
    except Exception as e:
        logger.error(f"Error getting semantics description result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
