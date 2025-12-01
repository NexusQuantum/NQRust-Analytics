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
from src.web.v1.services.sql_question import (
    SqlQuestionRequest,
    SqlQuestionResponse,
    SqlQuestionResultRequest,
    SqlQuestionResultResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/sql-questions")
async def sql_question(
    sql_question_request: SqlQuestionRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> SqlQuestionResponse:
    """
    Generate SQL questions - clean implementation

    Args:
        sql_question_request: SQL question generation request
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        SqlQuestionResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        sql_question_request.query_id = query_id

        # Initialize status in cache
        service_container.sql_question_service._sql_question_results[
            query_id
        ] = SqlQuestionResultResponse(
            status="generating",
        )

        # Add background task
        background_tasks.add_task(
            service_container.sql_question_service.sql_question,
            sql_question_request,
            service_metadata=asdict(service_metadata),
        )

        return SqlQuestionResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error generating SQL questions: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sql-questions/{query_id}")
async def get_sql_question_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> SqlQuestionResultResponse:
    """
    Get SQL question result - clean implementation

    Args:
        query_id: Query identifier
        service_container: Service container dependency

    Returns:
        SqlQuestionResultResponse: SQL question result

    Raises:
        HTTPException: If query_id not found or processing fails
    """
    try:
        return service_container.sql_question_service.get_sql_question_result(
            SqlQuestionResultRequest(query_id=query_id)
        )
    except KeyError:
        logger.warning(f"SQL question result not found: {query_id}")
        raise HTTPException(status_code=404, detail="SQL question result not found")
    except Exception as e:
        logger.error(f"Error getting SQL question result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
