"""Service layer for document indexing/status/delete.

Wraps the `Documents` indexing pipeline with a TTL-cache for status tracking
so the UI can poll progress while the BackgroundTask runs.
"""
from __future__ import annotations

import logging
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.pipelines.indexing.documents import DocumentSource

logger = logging.getLogger("analytics-service")


class DocumentsService:
    """Manage document indexing lifecycle and Qdrant cleanup."""

    class IndexRequest(BaseModel):
        document_id: str
        notebook_id: str
        project_id: str
        filename: str
        file_path: str

    class Error(BaseModel):
        code: Literal["PARSE_FAILED", "EMBED_FAILED", "OTHERS"]
        message: str

    class Event(BaseModel):
        document_id: str
        status: Literal["parsing", "embedding", "ready", "failed"] = "parsing"
        error: Optional["DocumentsService.Error"] = None
        chunks_indexed: int = 0

    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._cache: Dict[str, "DocumentsService.Event"] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    # ------------------------------------------------------------------
    # Index
    # ------------------------------------------------------------------

    async def index(self, request: "DocumentsService.IndexRequest") -> None:
        """Run the indexing pipeline; updates the cached status."""
        doc_id = request.document_id
        try:
            self._cache[doc_id] = self.Event(document_id=doc_id, status="parsing")

            source = DocumentSource(
                document_id=request.document_id,
                notebook_id=request.notebook_id,
                project_id=request.project_id,
                filename=request.filename,
                file_path=request.file_path,
            )

            self._cache[doc_id] = self.Event(document_id=doc_id, status="embedding")
            result = await self._pipelines["documents_indexing"].run(source=source)

            written = (
                result.get("write", {}).get("documents_written", 0) if result else 0
            )
            self._cache[doc_id] = self.Event(
                document_id=doc_id, status="ready", chunks_indexed=written
            )
            logger.info(
                f"[doc-service] document_id={doc_id} indexed; chunks_written={written}"
            )

        except Exception as e:  # surface the error in the cache so the UI can show it
            logger.exception(f"[doc-service] index failed for {doc_id}")
            self._cache[doc_id] = self.Event(
                document_id=doc_id,
                status="failed",
                error=self.Error(code="OTHERS", message=str(e)),
            )

    # ------------------------------------------------------------------
    # Status
    # ------------------------------------------------------------------

    def get_status(self, document_id: str) -> Optional["DocumentsService.Event"]:
        return self._cache.get(document_id)

    # ------------------------------------------------------------------
    # Delete
    # ------------------------------------------------------------------

    async def delete(self, document_id: str) -> None:
        """Remove all Qdrant chunks for a document_id."""
        try:
            await self._pipelines["documents_indexing"].clean(document_id=document_id)
            self._cache.pop(document_id, None)
            logger.info(f"[doc-service] document_id={document_id} chunks deleted")
        except Exception as e:
            logger.exception(f"[doc-service] delete failed for {document_id}")
            self._cache[document_id] = self.Event(
                document_id=document_id,
                status="failed",
                error=self.Error(code="OTHERS", message=f"Delete failed: {e}"),
            )
            raise

    # ------------------------------------------------------------------
    # Doc-only Q&A
    # ------------------------------------------------------------------

    async def ask(
        self,
        query: str,
        selected_document_ids: list[str],
        project_id: str = "",
    ) -> dict:
        """Answer a question using only the user's selected documents."""
        # Run pipeline up to a node that yields both retrieval and generation
        # results, so we can return chunks_used count alongside the answer.
        pipe = self._pipelines["document_answer"]
        result = await pipe._pipe.execute(
            ["generate_answer", "retrieved_chunks"],
            inputs={
                "query": query,
                "selected_document_ids": selected_document_ids,
                "project_id": project_id or "",
                **pipe._components,
            },
        )
        gen = result.get("generate_answer", {}) or {}
        # Pipeline returns (response_dict, generator_name) tuple; first item.
        if isinstance(gen, tuple):
            response, _ = gen
        else:
            response = gen
        replies = response.get("replies", []) if isinstance(response, dict) else []
        answer = replies[0] if replies else ""

        chunks = result.get("retrieved_chunks", []) or []
        return {"answer": answer, "chunks_used": len(chunks)}
