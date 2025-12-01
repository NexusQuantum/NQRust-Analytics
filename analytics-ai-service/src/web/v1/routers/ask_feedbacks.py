import logging
import uuid
from dataclasses import asdict

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException

from src.globals import (
    ServiceContainer,
    ServiceMetadata,
    get_service_container,
    get_service_metadata,
)
from src.web.v1.services.ask_feedback import (
    AskFeedbackRequest,
    AskFeedbackResponse,
    AskFeedbackResultRequest,
    AskFeedbackResultResponse,
    StopAskFeedbackRequest,
    StopAskFeedbackResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/ask-feedbacks")
async def ask_feedback(
    ask_feedback_request: AskFeedbackRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> AskFeedbackResponse:
    """
    Create ask feedback request - clean implementation

    Args:
        ask_feedback_request: Ask feedback request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        AskFeedbackResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        ask_feedback_request.query_id = query_id

        # Initialize status in cache
        service_container.ask_feedback_service._ask_feedback_results[
            query_id
        ] = AskFeedbackResultResponse(
            status="searching",
        )

        # Add background task
        background_tasks.add_task(
            service_container.ask_feedback_service.ask_feedback,
            ask_feedback_request,
            service_metadata=asdict(service_metadata),
        )

        return AskFeedbackResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error creating ask feedback request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/ask-feedbacks/{query_id}")
async def stop_ask_feedback(
    query_id: str,
    stop_ask_feedback_request: StopAskFeedbackRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StopAskFeedbackResponse:
    """
    Stop ask feedback request - clean implementation

    Args:
        query_id: Query identifier
        stop_ask_feedback_request: Stop ask feedback request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency

    Returns:
        StopAskFeedbackResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        stop_ask_feedback_request.query_id = query_id

        # Add background task
        background_tasks.add_task(
            service_container.ask_feedback_service.stop_ask_feedback,
            stop_ask_feedback_request,
        )

        return StopAskFeedbackResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error stopping ask feedback request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/ask-feedbacks/{query_id}")
async def get_ask_feedback_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> AskFeedbackResultResponse:
    """
    Get ask feedback result - clean implementation

    Args:
        query_id: Query identifier
        service_container: Service container dependency

    Returns:
        AskFeedbackResultResponse: Ask feedback result

    Raises:
        HTTPException: If query_id not found or processing fails
    """
    try:
        return service_container.ask_feedback_service.get_ask_feedback_result(
            AskFeedbackResultRequest(query_id=query_id)
        )
    except KeyError:
        logger.warning(f"Ask feedback result not found: {query_id}")
        raise HTTPException(status_code=404, detail="Ask feedback result not found")
    except Exception as e:
        logger.error(f"Error getting ask feedback result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
