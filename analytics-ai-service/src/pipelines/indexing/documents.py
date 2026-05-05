"""Document indexing pipeline.

Parses an uploaded file (PDF/DOCX/MD/TXT/...), splits per page, chunks by
token budget, embeds via the configured embedder provider, and writes the
resulting Haystack Documents into the `documents` Qdrant collection.

Each chunk's metadata carries:
    - document_id: caller-provided identifier (matches `document.id` in the UI DB)
    - notebook_id: the notebook the document belongs to
    - project_id: for multi-tenant isolation
    - filename: display filename
    - page: source page number (1-based)
    - chunk_index: position within the page (0 if a single chunk fits)

Cleaning is keyed on document_id, so re-indexing the same document
removes its old chunks before writing the new ones.
"""
from __future__ import annotations

import logging
import sys
import uuid
from pathlib import Path
from typing import Any, Dict, List, Optional

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack import Document, component
from haystack.document_stores.types import DocumentStore, DuplicatePolicy
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.document import chunk_pages, parse_document
from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import DocumentStoreProvider, EmbedderProvider
from src.pipelines.indexing import AsyncDocumentWriter

logger = logging.getLogger("analytics-service")


class DocumentSource(BaseModel):
    """Input describing a single file to be indexed."""

    document_id: str  # matches `document.id` in the analytics-ui DB
    notebook_id: str
    project_id: str
    filename: str
    file_path: str  # absolute path on disk


@component
class FileToChunks:
    """Parse a file and emit Haystack Documents (one per chunk)."""

    @component.output_types(documents=List[Document])
    def run(self, source: DocumentSource) -> Dict[str, Any]:
        path = Path(source.file_path)
        logger.info(
            f"[doc-index] Parsing {path.name} for document_id={source.document_id}"
        )
        parse_result = parse_document(path)
        chunks = chunk_pages(parse_result.pages)
        logger.info(
            f"[doc-index] {path.name}: {parse_result.page_count} pages -> {len(chunks)} chunks"
        )

        documents = [
            Document(
                id=str(uuid.uuid4()),
                content=chunk.text,
                meta={
                    "document_id": source.document_id,
                    "notebook_id": source.notebook_id,
                    "project_id": source.project_id,
                    "filename": source.filename,
                    "page": chunk.page,
                    "chunk_index": chunk.chunk_index,
                },
            )
            for chunk in chunks
        ]
        return {"documents": documents}


@component
class DocumentChunksCleaner:
    """Remove all existing chunks for a given document_id from the store."""

    def __init__(self, store: DocumentStore) -> None:
        self.store = store

    @component.output_types()
    async def run(self, document_id: str) -> None:
        await self.store.delete_documents(
            {
                "operator": "AND",
                "conditions": [
                    {"field": "document_id", "operator": "==", "value": document_id},
                ],
            }
        )


# --- Pipeline DAG nodes (Hamilton resolves these by name) ----------------


@observe(capture_input=False)
def to_documents(
    source: DocumentSource,
    file_to_chunks: FileToChunks,
) -> Dict[str, Any]:
    return file_to_chunks.run(source=source)


@observe(capture_input=False, capture_output=False)
async def embedding(
    to_documents: Dict[str, Any],
    embedder: Any,
) -> Dict[str, Any]:
    if not to_documents["documents"]:
        return {"documents": []}
    return await embedder.run(documents=to_documents["documents"])


@observe(capture_input=False, capture_output=False)
async def clean(
    cleaner: DocumentChunksCleaner,
    source: DocumentSource,
    embedding: Dict[str, Any] = {},
) -> Dict[str, Any]:
    """Delete existing chunks for this document_id before write."""
    await cleaner.run(document_id=source.document_id)
    return embedding


@observe(capture_input=False)
async def write(
    clean: Dict[str, Any],
    writer: AsyncDocumentWriter,
) -> Dict[str, Any]:
    if not clean.get("documents"):
        return {"documents_written": 0}
    return await writer.run(documents=clean["documents"])


# --- Pipeline class ------------------------------------------------------


class Documents(EnhancedBasicPipeline):
    """Document indexing pipeline (parse -> chunk -> embed -> write)."""

    def __init__(
        self,
        embedder_provider: EmbedderProvider,
        document_store_provider: DocumentStoreProvider,
        **kwargs,
    ) -> None:
        store = document_store_provider.get_store(dataset_name="documents")

        self._components = {
            "file_to_chunks": FileToChunks(),
            "embedder": embedder_provider.get_document_embedder(),
            "cleaner": DocumentChunksCleaner(store),
            "writer": AsyncDocumentWriter(
                document_store=store,
                policy=DuplicatePolicy.OVERWRITE,
            ),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Documents Indexing")
    async def _execute(self, source: DocumentSource) -> Dict[str, Any]:
        logger.info(
            f"[doc-index] Documents Indexing pipeline running for "
            f"document_id={source.document_id} project_id={source.project_id}"
        )
        inputs = {"source": source, **self._components}
        return await self._pipe.execute(["write"], inputs=inputs)

    async def run(self, source: DocumentSource) -> Dict[str, Any]:
        return await self._execute(source=source)

    @observe(name="Clean Documents (single doc)")
    async def clean(self, document_id: str) -> None:
        """Remove all chunks for a document_id (used on document delete)."""
        await self._components["cleaner"].run(document_id=document_id)
