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
from src.web.v1.services.chart import (
    ChartRequest,
    ChartResponse,
    ChartResultRequest,
    ChartResultResponse,
    StopChartRequest,
    StopChartResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/charts")
async def chart(
    chart_request: ChartRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> ChartResponse:
    """
    Create new chart request - clean implementation

    Args:
        chart_request: Chart request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        ChartResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        chart_request.query_id = query_id

        # Initialize status in cache
        service_container.chart_service._chart_results[query_id] = ChartResultResponse(
            status="fetching",
        )

        # Add background task
        background_tasks.add_task(
            service_container.chart_service.chart,
            chart_request,
            service_metadata=asdict(service_metadata),
        )

        return ChartResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error creating chart request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/charts/{query_id}")
async def stop_chart(
    query_id: str,
    stop_chart_request: StopChartRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StopChartResponse:
    """
    Stop chart request - clean implementation

    Args:
        query_id: Query ID to stop
        stop_chart_request: Stop chart request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency

    Returns:
        StopChartResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        stop_chart_request.query_id = query_id

        # Add background task
        background_tasks.add_task(
            service_container.chart_service.stop_chart,
            stop_chart_request,
        )

        return StopChartResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error stopping chart request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/charts/{query_id}")
async def get_chart_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> ChartResultResponse:
    """
    Get chart result - clean implementation

    Args:
        query_id: Query ID to get result for
        service_container: Service container dependency

    Returns:
        ChartResultResponse: Chart result response

    Raises:
        HTTPException: If request processing fails
    """
    try:
        return service_container.chart_service.get_chart_result(
            ChartResultRequest(query_id=query_id)
        )

    except Exception as e:
        logger.error(f"Error getting chart result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
