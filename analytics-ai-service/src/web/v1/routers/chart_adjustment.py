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
from src.web.v1.services.chart_adjustment import (
    ChartAdjustmentRequest,
    ChartAdjustmentResponse,
    ChartAdjustmentResultRequest,
    ChartAdjustmentResultResponse,
    StopChartAdjustmentRequest,
    StopChartAdjustmentResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/chart-adjustments")
async def chart_adjustment(
    chart_adjustment_request: ChartAdjustmentRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
    service_metadata: ServiceMetadata = Depends(get_service_metadata),
) -> ChartAdjustmentResponse:
    """
    Create chart adjustment request - clean implementation

    Args:
        chart_adjustment_request: Chart adjustment request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency
        service_metadata: Service metadata dependency

    Returns:
        ChartAdjustmentResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        query_id = str(uuid.uuid4())
        chart_adjustment_request.query_id = query_id

        # Initialize status in cache
        service_container.chart_adjustment_service._chart_adjustment_results[
            query_id
        ] = ChartAdjustmentResultResponse(
            status="fetching",
        )

        # Add background task
        background_tasks.add_task(
            service_container.chart_adjustment_service.chart_adjustment,
            chart_adjustment_request,
            service_metadata=asdict(service_metadata),
        )

        return ChartAdjustmentResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error creating chart adjustment request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.patch("/chart-adjustments/{query_id}")
async def stop_chart_adjustment(
    query_id: str,
    stop_chart_adjustment_request: StopChartAdjustmentRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
) -> StopChartAdjustmentResponse:
    """
    Stop chart adjustment request - clean implementation

    Args:
        query_id: Query identifier
        stop_chart_adjustment_request: Stop chart adjustment request object
        background_tasks: FastAPI background tasks
        service_container: Service container dependency

    Returns:
        StopChartAdjustmentResponse: Response with query_id

    Raises:
        HTTPException: If request processing fails
    """
    try:
        stop_chart_adjustment_request.query_id = query_id

        # Add background task
        background_tasks.add_task(
            service_container.chart_adjustment_service.stop_chart_adjustment,
            stop_chart_adjustment_request,
        )

        return StopChartAdjustmentResponse(query_id=query_id)

    except Exception as e:
        logger.error(f"Error stopping chart adjustment request: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/chart-adjustments/{query_id}")
async def get_chart_adjustment_result(
    query_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> ChartAdjustmentResultResponse:
    """
    Get chart adjustment result - clean implementation

    Args:
        query_id: Query identifier
        service_container: Service container dependency

    Returns:
        ChartAdjustmentResultResponse: Chart adjustment result

    Raises:
        HTTPException: If query_id not found or processing fails
    """
    try:
        return service_container.chart_adjustment_service.get_chart_adjustment_result(
            ChartAdjustmentResultRequest(query_id=query_id)
        )
    except KeyError:
        logger.warning(f"Chart adjustment result not found: {query_id}")
        raise HTTPException(status_code=404, detail="Chart adjustment result not found")
    except Exception as e:
        logger.error(f"Error getting chart adjustment result: {e}")
        raise HTTPException(status_code=500, detail=str(e))
