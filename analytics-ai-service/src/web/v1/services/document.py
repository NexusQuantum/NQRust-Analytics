import asyncio
import logging
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline

logger = logging.getLogger("analytics-service")


class DocumentIndexRequest(BaseModel):
    document_id: str
    file_path: str
    callback_url: Optional[str] = None


class DocumentIndexResponse(BaseModel):
    document_id: str
    status: Literal["indexing", "failed"] = "indexing"


class DocumentStatusResponse(BaseModel):
    document_id: str
    status: Literal["indexing", "indexed", "failed"]
    page_count: Optional[int] = None
    error: Optional[str] = None


class DocumentDeleteRequest(BaseModel):
    document_id: str


class DocumentRetrievalRequest(BaseModel):
    question: str
    document_ids: list[str]
    trees: Optional[Dict[str, dict]] = None


class DocumentRetrievalResponse(BaseModel):
    passages: list[dict]


class DocumentService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000,
        ttl: int = 3600,
    ):
        self._pipelines = pipelines
        self._status_cache: Dict[str, DocumentStatusResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    def _set_status(self, document_id: str, status: str, **kwargs) -> None:
        self._status_cache[document_id] = DocumentStatusResponse(
            document_id=document_id, status=status, **kwargs
        )

    def get_status(self, document_id: str) -> Optional[DocumentStatusResponse]:
        return self._status_cache.get(document_id)

    async def _on_index_complete(
        self, document_id: str, tree: dict, page_count: int, error: Optional[str] = None
    ) -> None:
        """Called by DocumentIndexing pipeline when done. Updates status + calls UI callback."""
        if error:
            self._set_status(document_id, "failed", error=error)
            logger.error(f"Indexing failed for {document_id}: {error}")
        else:
            self._set_status(document_id, "indexed", page_count=page_count)
            logger.info(f"Indexing complete for {document_id} ({page_count} pages)")

    async def index_document(self, request: DocumentIndexRequest) -> DocumentIndexResponse:
        """Fire-and-forget document indexing."""
        document_id = request.document_id
        self._set_status(document_id, "indexing")

        asyncio.create_task(
            self._pipelines["document_indexing"].run(
                document_id=document_id,
                file_path=request.file_path,
                callback_url=request.callback_url,
            )
        )

        return DocumentIndexResponse(document_id=document_id, status="indexing")

    async def delete_document(self, document_id: str) -> None:
        """Remove document from caches."""
        from src.core.document.cache import invalidate_document
        invalidate_document(document_id)
        self._status_cache.pop(document_id, None)

    async def retrieve_passages(
        self, request: DocumentRetrievalRequest
    ) -> DocumentRetrievalResponse:
        """Retrieve relevant passages from selected documents for a question."""
        result = await self._pipelines["document_retrieval"].run(
            question=request.question,
            document_ids=request.document_ids,
            trees=request.trees,
        )
        return DocumentRetrievalResponse(passages=result.get("passages", []))

    async def answer_from_documents(
        self,
        query: str,
        passages: list[dict],
        language: str = "en",
    ) -> dict:
        """Generate a natural-language answer from document passages."""
        return await self._pipelines["document_answer"].run(
            query=query,
            passages=passages,
            language=language,
        )
