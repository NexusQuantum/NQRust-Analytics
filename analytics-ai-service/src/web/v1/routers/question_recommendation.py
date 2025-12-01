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
from src.web.v1.services import BaseRequest, QuestionRecommendation

logger = logging.getLogger("analytics-service")
router = APIRouter()


class PostRequest(BaseRequest):
    """Request model for question recommendation"""

    mdl: str
    previous_questions: list[str] = []
    max_questions: int = 5
    max_categories: int = 3
    regenerate: bool = False
    allow_data_preview: bool = True


class PostResponse(BaseModel):
    """Response model for question recommendation"""

    id: str


@router.post(
    "/question-recommendations",
    response_model=PostResponse,
)
async def recommend(
    request: PostRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> PostResponse:
    """
    Generate question recommendations - clean implementation

    Args:
        request: Question recommendation request
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
        service = service_container.question_recommendation
        service[event_id] = QuestionRecommendation.Event(event_id=event_id)

        _request = QuestionRecommendation.Request(
            event_id=event_id, **request.model_dump()
        )

        background_tasks.add_task(
            service.recommend,
            _request,
            service_metadata=asdict(service_metadata),
        )

        return PostResponse(id=event_id)

    except Exception as e:
        logger.error(f"Error generating question recommendations: {e}")
        raise HTTPException(status_code=500, detail=str(e))


class GetResponse(BaseModel):
    """Response model for getting question recommendation status"""

    id: str
    status: Literal["generating", "finished", "failed"]
    response: Optional[dict]
    error: Optional[dict]
    trace_id: Optional[str] = None


@router.get(
    "/question-recommendations/{event_id}",
    response_model=GetResponse,
)
async def get(
    event_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> GetResponse:
    """
    Get question recommendation status - clean implementation

    Args:
        event_id: Event identifier
        service_container: Service container dependency

    Returns:
        GetResponse: Question recommendation status and results

    Raises:
        HTTPException: If event not found or processing fails
    """
    try:
        event: QuestionRecommendation.Event = service_container.question_recommendation[
            event_id
        ]

        def _formatter(response: dict) -> dict:
            """Format response questions"""
            questions = [
                question
                for _, questions in response["questions"].items()
                for question in questions
            ]
            return {"questions": questions}

        return GetResponse(
            id=event.event_id,
            status=event.status,
            response=_formatter(event.response),
            error=event.error and event.error.model_dump(),
            trace_id=event.trace_id,
        )

    except KeyError:
        logger.warning(f"Question recommendation event not found: {event_id}")
        raise HTTPException(
            status_code=404, detail="Question recommendation event not found"
        )
    except Exception as e:
        logger.error(f"Error getting question recommendation: {e}")
        raise HTTPException(status_code=500, detail=str(e))
