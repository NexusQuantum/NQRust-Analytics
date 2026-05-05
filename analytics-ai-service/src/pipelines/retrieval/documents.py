"""Document retrieval pipeline.

Embeds the user's question, then queries the `documents` Qdrant
collection with `document_id IN selected_document_ids` to retrieve only
chunks from documents the user has checked.

Output is a flat list of dicts:
    [{"document_id", "filename", "page", "chunk_index", "text", "score"}, ...]
ready to be injected as context into the SQL generation prompt.
"""
from __future__ import annotations

import logging
import sys
from typing import Any, Dict, List, Optional

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack import Document, component
from langfuse.decorators import observe

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import DocumentStoreProvider, EmbedderProvider
from src.pipelines.common import ScoreFilter

logger = logging.getLogger("analytics-service")


@component
class DocumentChunkFormatter:
    """Convert Haystack Documents into the dict shape expected by the SQL prompt."""

    @component.output_types(documents=List[Dict[str, Any]])
    def run(self, documents: List[Document]) -> Dict[str, Any]:
        formatted = [
            {
                "document_id": doc.meta.get("document_id", ""),
                "filename": doc.meta.get("filename", ""),
                "page": doc.meta.get("page"),
                "chunk_index": doc.meta.get("chunk_index", 0),
                "text": doc.content or "",
                "score": doc.score,
            }
            for doc in documents
        ]
        return {"documents": formatted}


# --- Pipeline DAG nodes --------------------------------------------------


@observe(capture_input=False, capture_output=False)
async def embedding(query: str, embedder: Any) -> Dict[str, Any]:
    return await embedder.run(query)


@observe(capture_input=False)
async def retrieval(
    embedding: Dict[str, Any],
    selected_document_ids: List[str],
    project_id: str,
    retriever: Any,
    top_k: int,
) -> Dict[str, Any]:
    if not selected_document_ids:
        return {"documents": []}

    filters: Dict[str, Any] = {
        "operator": "AND",
        "conditions": [
            {"field": "document_id", "operator": "in", "value": selected_document_ids},
        ],
    }
    if project_id:
        filters["conditions"].append(
            {"field": "project_id", "operator": "==", "value": project_id}
        )

    res = await retriever.run(
        query_embedding=embedding.get("embedding"),
        filters=filters,
        top_k=top_k,
    )
    return {"documents": res.get("documents", [])}


@observe(capture_input=False)
def filtered(
    retrieval: Dict[str, Any],
    score_filter: ScoreFilter,
    similarity_threshold: float,
    top_k: int,
) -> Dict[str, Any]:
    if not retrieval.get("documents"):
        return {"documents": []}
    return score_filter.run(
        documents=retrieval["documents"],
        score=similarity_threshold,
        max_size=top_k,
    )


@observe(capture_input=False)
def formatted_output(
    filtered: Dict[str, Any],
    formatter: DocumentChunkFormatter,
) -> Dict[str, Any]:
    if not filtered.get("documents"):
        return {"documents": []}
    return formatter.run(documents=filtered["documents"])


# --- Pipeline class ------------------------------------------------------


class DocumentsRetrieval(EnhancedBasicPipeline):
    """Retrieve top-K relevant chunks from the user's selected documents."""

    def __init__(
        self,
        embedder_provider: EmbedderProvider,
        document_store_provider: DocumentStoreProvider,
        similarity_threshold: float = 0.5,
        top_k: int = 8,
        **kwargs,
    ) -> None:
        store = document_store_provider.get_store(dataset_name="documents")
        self._components = {
            "embedder": embedder_provider.get_text_embedder(),
            "retriever": document_store_provider.get_retriever(document_store=store),
            "score_filter": ScoreFilter(),
            "formatter": DocumentChunkFormatter(),
        }
        self._configs = {
            "similarity_threshold": similarity_threshold,
            "top_k": top_k,
        }
        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Documents Retrieval")
    async def _execute(
        self,
        query: str,
        selected_document_ids: List[str],
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        if not selected_document_ids:
            logger.info("[doc-retrieve] No documents selected; skipping retrieval.")
            return {"formatted_output": {"documents": []}}

        logger.info(
            f"[doc-retrieve] Retrieving from {len(selected_document_ids)} document(s) "
            f"for query={query!r} project_id={project_id}"
        )
        return await self._pipe.execute(
            ["formatted_output"],
            inputs={
                "query": query,
                "selected_document_ids": selected_document_ids,
                "project_id": project_id or "",
                **self._components,
                **self._configs,
            },
        )

    async def run(
        self,
        query: str,
        selected_document_ids: List[str],
        project_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return await self._execute(
            query=query,
            selected_document_ids=selected_document_ids,
            project_id=project_id,
        )
