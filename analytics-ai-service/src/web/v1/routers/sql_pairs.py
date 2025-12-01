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
from src.pipelines.indexing.sql_pairs import SqlPair
from src.web.v1.services import BaseRequest, SqlPairsService

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for indexing SQL pairs"""

    sql_pairs: List[SqlPair]


class PostResponse(BaseModel):
    """Response model for indexing SQL pairs"""

    event_id: str


@router.post("/sql-pairs")
async def prepare(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Index SQL pairs - clean implementation

    Args:
        request: SQL pairs indexing request
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
        service = service_container.sql_pairs_service
        service[event_id] = SqlPairsService.Event(id=event_id, status="indexing")

        index_request = SqlPairsService.IndexRequest(
            id=event_id, **request.model_dump()
        )

        background_tasks.add_task(
            service.index,
            index_request,
            service_metadata=asdict(service_metadata),
        )
        return PostResponse(event_id=event_id)

    except Exception as e:
        logger.error(f"Error indexing SQL pairs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class DeleteRequest(BaseRequest):
    """Request model for deleting SQL pairs"""

    sql_pair_ids: List[str]


@router.delete("/sql-pairs")
async def delete(
    request: DeleteRequest,
    response: Response,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> None | SqlPairsService.Event.Error:
    """
    Delete SQL pairs - clean implementation

    Args:
        request: SQL pairs deletion request
        response: FastAPI response object
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        None or SqlPairsService.Event.Error: Error if deletion fails

    Raises:
        HTTPException: If request processing fails
    """
    try:
        event_id = str(uuid.uuid4())
        service = service_container.sql_pairs_service
        service[event_id] = SqlPairsService.Event(id=event_id, status="deleting")

        delete_request = SqlPairsService.DeleteRequest(
            id=event_id,
            **request.model_dump(),
        )

        await service.delete(delete_request, service_metadata=asdict(service_metadata))

        event: SqlPairsService.Event = service[event_id]

        if event.status == "failed":
            response.status_code = 500
            return event.error

    except Exception as e:
        logger.error(f"Error deleting SQL pairs: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting SQL pairs event status"""

    event_id: str
    status: Literal["indexing", "deleting", "finished", "failed"]
    error: Optional[dict]
    trace_id: Optional[str]


@router.get("/sql-pairs/{event_id}")
async def get(
    event_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get SQL pairs event status - clean implementation

    Args:
        event_id: Event identifier
        container: Service container dependency

    Returns:
        GetResponse: Event status information

    Raises:
        HTTPException: If event not found or processing fails
    """
    try:
        event: SqlPairsService.Event = container.sql_pairs_service[event_id]
        return GetResponse(
            event_id=event.id,
            status=event.status,
            error=event.error and event.error.model_dump(),
            trace_id=event.trace_id,
        )
    except KeyError:
        logger.warning(f"SQL pairs event not found: {event_id}")
        raise HTTPException(status_code=404, detail="SQL pairs event not found")
    except Exception as e:
        logger.error(f"Error getting SQL pairs event: {e}")
        raise HTTPException(status_code=500, detail=str(e))
