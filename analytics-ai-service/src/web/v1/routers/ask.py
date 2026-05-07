import logging
import uuid
from dataclasses import asdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.responses import StreamingResponse

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services.ask import (
    AskRequest,
    AskResponse,
    AskResultRequest,
    AskResultResponse,
    StopAskRequest,
    StopAskResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/asks")
async def ask(
    ask_request: AskRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> AskResponse:
    """
    Create new ask request - clean implementation

    Args:
        ask_request: Ask request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        AskResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        ask_request.query_id = query_id

        # Initialize status in cache
        service_container.ask_service._ask_results[query_id] = AskResultResponse(
            status="understanding",
        )

        # Add background task
        background_tasks.add_task(
            service_container.ask_service.ask,
            ask_request,
            service_metadata=asdict(service_metadata),
        )

        return AskResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error creating ask request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/asks/{query_id}")
async def stop_ask(
    query_id: str,
    stop_ask_request: StopAskRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StopAskResponse:
    """
    Stop ask request - clean implementation

    Args:
        query_id: Query ID to stop
        stop_ask_request: Stop ask request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency

    Returns:
        StopAskResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        stop_ask_request.query_id = query_id

        # Add background task
        background_tasks.add_task(
            service_container.ask_service.stop_ask,
            stop_ask_request,
        )

        return StopAskResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error stopping ask request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/asks/{query_id}/result")
async def get_ask_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> AskResultResponse:
    """
    Get ask result - clean implementation

    Args:
        query_id: Query ID to get result for
        service_container: Service container dependency

    Returns:
        AskResultResponse: Ask result response

    Raises:
        HTTPException: If request processing fails
    """
    try:
        return service_container.ask_service.get_ask_result(
            AskResultRequest(query_id=query_id)
        )

    except Exception as e:
        logger.error(f"Error getting ask result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/asks/{query_id}/streaming-result")
async def get_ask_streaming_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StreamingResponse:
    """
    Get ask streaming result - clean implementation

    Args:
        query_id: Query ID to get streaming result for
        service_container: Service container dependency

    Returns:
        StreamingResponse: Streaming response with ask result

    Raises:
        HTTPException: If request processing fails
    """
    try:
        return StreamingResponse(
            service_container.ask_service.get_ask_streaming_result(query_id),
            media_type="text/event-stream",
        )

    except Exception as e:
        logger.error(f"Error getting ask streaming result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
