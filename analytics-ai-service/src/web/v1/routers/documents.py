"""Document indexing/status/delete endpoints.

POST   /v1/documents/index      -> trigger BackgroundTask indexing
GET    /v1/documents/{id}/status -> poll indexing status
DELETE /v1/documents/{id}       -> remove from Qdrant
POST   /v1/documents/ask         -> doc-only Q&A (synchronous)
"""
import logging
from typing import List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from src.globals import ServiceContainer, get_service_container
from src.web.v1.services.documents import DocumentsService

logger = logging.getLogger("analytics-service")
router = APIRouter()


class DocumentAskRequest(BaseModel):
    query: str
    selected_document_ids: List[str]
    project_id: str | None = None


class DocumentAskResponse(BaseModel):
    answer: str
    chunks_used: int


@router.post("/documents/index", status_code=202)
async def index_document(
    request: DocumentsService.IndexRequest,
    background_tasks: BackgroundTasks,
    service_container: ServiceContainer = Depends(get_service_container),
) -> dict:
    """Kick off async document indexing.

    Caller is the analytics-ui upload endpoint. The file at request.file_path
    must already be on disk and accessible to this service.
    """
    try:
        # Seed status immediately so the first poll doesn't 404.
        service_container.documents_service._cache[request.document_id] = (
            DocumentsService.Event(document_id=request.document_id, status="parsing")
        )
        background_tasks.add_task(service_container.documents_service.index, request)
        return {"document_id": request.document_id, "status": "parsing"}
    except Exception as e:
        logger.error(f"Error starting document indexing: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/documents/{document_id}/status")
async def get_document_status(
    document_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> dict:
    event = service_container.documents_service.get_status(document_id)
    if event is None:
        # No cached status — either never indexed or TTL expired. Caller can
        # treat this as "unknown"; the source-of-truth is the UI database.
        return {"document_id": document_id, "status": "unknown"}
    return event.model_dump()


@router.delete("/documents/{document_id}", status_code=204)
async def delete_document(
    document_id: str,
    service_container: ServiceContainer = Depends(get_service_container),
) -> None:
    try:
        await service_container.documents_service.delete(document_id)
    except Exception as e:
        logger.error(f"Error deleting document {document_id}: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/documents/ask", response_model=DocumentAskResponse)
async def ask_documents(
    request: DocumentAskRequest,
    service_container: ServiceContainer = Depends(get_service_container),
) -> DocumentAskResponse:
    """Synchronous doc-only Q&A.

    Bypasses the SQL pipeline entirely. Useful when the user has uploaded
    documents and wants an answer purely from those documents (no DB).
    """
    try:
        if not request.selected_document_ids:
            raise HTTPException(
                status_code=400,
                detail="selected_document_ids must be non-empty",
            )

        result = await service_container.documents_service.ask(
            query=request.query,
            selected_document_ids=request.selected_document_ids,
            project_id=request.project_id or "",
        )
        return DocumentAskResponse(
            answer=result.get("answer", ""),
            chunks_used=result.get("chunks_used", 0),
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Doc-only ask failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))
