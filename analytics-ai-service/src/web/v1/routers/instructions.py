import logging
import uuid
from dataclasses import asdict
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Response
from pydantic import BaseModel

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services import BaseRequest, InstructionsService

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for indexing instructions"""

    instructions: List[InstructionsService.Instruction]


class PostResponse(BaseModel):
    """Response model for indexing instructions"""

    event_id: str


@router.post("/instructions")
async def index(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Index instructions - clean implementation

    Args:
        request: Instructions indexing request
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        PostResponse: Response with event_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        event_id = str(uuid.uuid4())
        service = service_container.instructions_service
        service[event_id] = InstructionsService.Event(event_id=event_id)

        index_request = InstructionsService.IndexRequest(
            event_id=event_id, **request.model_dump()
        )

        background_tasks.add_task(
            service.index,
            index_request,
            service_metadata=asdict(service_metadata),
        )
        return PostResponse(event_id=event_id)

    except Exception as e:
        logger.error(f"Error indexing instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRequest(BaseRequest):
    """Request model for deleting instructions"""

    instruction_ids: List[str]


@router.delete("/instructions")
async def delete(
    request: DeleteRequest,
    response: Response,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> None | InstructionsService.Error:
    """
    Delete instructions - clean implementation

    Args:
        request: Instructions deletion request
        response: FastAPI response object
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        None or InstructionsService.Error: Error if deletion fails

    Raises:
        HTTPException: If request processing fails
    """
    try:
        event_id = str(uuid.uuid4())
        service = service_container.instructions_service
        service[event_id] = InstructionsService.Event(
            event_id=event_id, status="deleting"
        )

        delete_request = InstructionsService.DeleteRequest(
            event_id=event_id,
            **request.model_dump(),
        )

        await service.delete(delete_request, service_metadata=asdict(service_metadata))

        event: InstructionsService.Event = service[event_id]

        if event.status == "failed":
            response.status_code = 500
            return event.error

    except Exception as e:
        logger.error(f"Error deleting instructions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting instruction event status"""

    event_id: str
    status: Literal["indexing", "deleting", "finished", "failed"]
    error: Optional[dict]
    trace_id: Optional[str]


@router.get("/instructions/{event_id}")
async def get(
    event_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get instruction event status - clean implementation

    Args:
        event_id: Event identifier
        container: Service container dependency

    Returns:
        GetResponse: Event status information

    Raises:
        HTTPException: If event not found or processing fails
    """
    try:
        event: InstructionsService.Event = container.instructions_service[event_id]
        return GetResponse(**event.model_dump())
    except KeyError:
        logger.warning(f"Instruction event not found: {event_id}")
        raise HTTPException(status_code=404, detail="Instruction event not found")
    except Exception as e:
        logger.error(f"Error getting instruction event: {e}")
        raise HTTPException(status_code=500, detail=str(e))
