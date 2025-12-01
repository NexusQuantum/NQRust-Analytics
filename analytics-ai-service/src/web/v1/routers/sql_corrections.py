import logging
import uuid
from dataclasses import asdict
from typing import List, Literal, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services import BaseRequest, SqlCorrectionService

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for SQL correction endpoint"""

    sql: str
    error: str
    retrieved_tables: Optional[List[str]] = None
    use_dry_plan: bool = False
    allow_dry_plan_fallback: bool = True


class PostResponse(BaseModel):
    """Response model for SQL correction endpoint"""

    event_id: str


@router.post("/sql-corrections")
async def correct(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Correct SQL - clean implementation

    Args:
        request: SQL correction request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        PostResponse: Response with event ID

    Raises:
        HTTPException: If request processing fails
    """
    try:
        event_id = str(uuid.uuid4())
        service = service_container.sql_correction_service

        # Initialize event
        service[event_id] = SqlCorrectionService.Event(event_id=event_id)

        # Create correction request
        correction_request = SqlCorrectionService.CorrectionRequest(
            event_id=event_id, **request.model_dump()
        )

        # Add background task
        background_tasks.add_task(
            service.correct,
            correction_request,
            service_metadata=asdict(service_metadata),
        )

        return PostResponse(event_id=event_id)

    except Exception as e:
        logger.error(f"Error creating SQL correction request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting SQL correction result"""

    event_id: str
    status: Literal["correcting", "finished", "failed"]
    response: Optional[str] = None
    error: Optional[dict] = None
    trace_id: Optional[str] = None
    invalid_sql: Optional[str] = None


@router.get("/sql-corrections/{event_id}")
async def get(
    event_id: str,
    container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get SQL correction result - clean implementation

    Args:
        event_id: Event identifier
        container: Service container dependency

    Returns:
        GetResponse: SQL correction result

    Raises:
        HTTPException: If event not found or processing fails
    """
    try:
        event: SqlCorrectionService.Event = container.sql_correction_service[event_id]
        return GetResponse(**event.model_dump())
    except KeyError:
        logger.warning(f"SQL correction event not found: {event_id}")
        raise HTTPException(status_code=404, detail="SQL correction event not found")
    except Exception as e:
        logger.error(f"Error getting SQL correction result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
