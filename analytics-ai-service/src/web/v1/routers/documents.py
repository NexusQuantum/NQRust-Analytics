import logging

from fastapi import APIRouter, Depends, HTTPException

from src.globals import ServiceContainer, get_service_container
from src.web.v1.services.document import (
    DocumentDeleteRequest,
    DocumentIndexRequest,
    DocumentIndexResponse,
    DocumentRetrievalRequest,
    DocumentRetrievalResponse,
    DocumentStatusResponse,
)

logger = logging.getLogger("analytics-service")
router = APIRouter()


@router.post("/documents/index")
async def index_document(
    request: DocumentIndexRequest,
    service_container: ServiceContainer = Depends(get_service_container),
) -> DocumentIndexResponse:
    """
    Start async indexing of a document.
    The caller (analytics-ui) should poll /v1/documents/{id}/status for completion.
    """
    try:
        return await service_container.document_service.index_document(request)
    except Exception as e:
        logger.error(f"Failed to start document indexing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> DocumentStatusResponse:
    """Poll indexing status for a document."""
    status = service_container.document_service.get_status(document_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Document {document_id} not found")
    return status


@router.delete("/documents/{document_id}")
async def delete_document(
    document_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> dict:
    """Remove a document from caches (does NOT delete the file — UI handles that)."""
    try:
        await service_container.document_service.delete_document(document_id)
        return {"status": "ok", "document_id": document_id}
    except Exception as e:
        logger.error(f"Failed to delete document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/retrieve")
async def retrieve_passages(
    request: DocumentRetrievalRequest,
    service_container: ServiceContainer = Depends(get_service_container),
) -> DocumentRetrievalResponse:
    """
    Retrieve relevant passages from selected documents for a question.
    Used by ask service internally — also exposed for direct calls.
    """
    try:
        return await service_container.document_service.retrieve_passages(request)
    except Exception as e:
        logger.error(f"Document retrieval failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
