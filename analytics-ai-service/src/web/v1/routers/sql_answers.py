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
from src.web.v1.services.sql_answer import (
    SqlAnswerRequest,
    SqlAnswerResponse,
    SqlAnswerResultRequest,
    SqlAnswerResultResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/sql-answers")
async def sql_answer(
    sql_answer_request: SqlAnswerRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> SqlAnswerResponse:
    """
    Create new sql answer request - clean implementation

    Args:
        sql_answer_request: Sql answer request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        SqlAnswerResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        sql_answer_request.query_id = query_id

        # Initialize status in cache
        service_container.sql_answer_service._sql_answer_results[
            query_id
        ] = SqlAnswerResultResponse(
            status="preprocessing",
        )

        # Add background task
        background_tasks.add_task(
            service_container.sql_answer_service.sql_answer,
            sql_answer_request,
            service_metadata=asdict(service_metadata),
        )

        return SqlAnswerResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error creating sql answer request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sql-answers/{query_id}")
async def get_sql_answer_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> SqlAnswerResultResponse:
    """
    Get sql answer result by query_id - clean implementation

    Args:
        query_id: Unique query identifier
        service_container: Service container dependency

    Returns:
        SqlAnswerResultResponse: Sql answer result

    Raises:
        HTTPException: If query_id not found or processing fails
    """
    try:
        return service_container.sql_answer_service.get_sql_answer_result(
            SqlAnswerResultRequest(query_id=query_id)
        )
    except KeyError:
        logger.warning(f"Sql answer result not found for query_id: {query_id}")
        raise HTTPException(status_code=404, detail="Sql answer result not found")
    except Exception as e:
        logger.error(f"Error getting sql answer result: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sql-answers/{query_id}/streaming")
async def get_sql_answer_streaming_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StreamingResponse:
    """
    Get sql answer streaming result by query_id - clean implementation

    Args:
        query_id: Unique query identifier
        service_container: Service container dependency

    Returns:
        StreamingResponse: Server-sent events stream

    Raises:
        HTTPException: If query_id not found or processing fails
    """
    try:
        return StreamingResponse(
            service_container.sql_answer_service.get_sql_answer_streaming_result(
                query_id
            ),
            media_type="text/event-stream",
        )
    except KeyError:
        logger.warning(f"Sql answer result not found for query_id: {query_id}")
        raise HTTPException(status_code=404, detail="Sql answer result not found")
    except Exception as e:
        logger.error(f"Error getting sql answer streaming result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
