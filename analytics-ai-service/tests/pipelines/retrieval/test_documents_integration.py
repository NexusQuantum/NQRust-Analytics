"""Integration test for the documents retrieval pipeline against real Qdrant.

Uses a deterministic hash-based embedder so we don't need OpenAI API keys.
The same embedding function indexes test data and embeds the query,
so a chunk whose text matches the query exactly will retrieve perfectly.
"""
from __future__ import annotations

import hashlib
import sys
from pathlib import Path
from typing import Any, Dict, List

import pymupdf
import pytest
import pytest_asyncio
from haystack import Document, component
from haystack.document_stores.types import DuplicatePolicy
from src.providers.document_store.qdrant import AsyncQdrantEmbeddingRetriever
from src.pipelines.indexing.documents import (
    DocumentChunksCleaner,
    DocumentSource,
    FileToChunks,
)
from src.pipelines.retrieval.documents import (
    DocumentChunkFormatter,
    DocumentsRetrieval,
)
from src.pipelines.indexing import AsyncDocumentWriter
from src.pipelines.common import ScoreFilter
from src.providers.document_store.qdrant import AsyncQdrantDocumentStore


QDRANT_URL = "http://localhost:6333"
EMBEDDING_DIM = 64


def _qdrant_reachable() -> bool:
    import urllib.request
    import urllib.error

    try:
        with urllib.request.urlopen(QDRANT_URL + "/", timeout=2) as r:
            return r.status == 200
    except (urllib.error.URLError, OSError):
        return False


pytestmark = pytest.mark.skipif(
    not _qdrant_reachable(), reason="Qdrant not running at localhost:6333"
)


def _hash_embed(text: str) -> List[float]:
    h = hashlib.sha256(text.encode("utf-8")).digest()
    raw = (h * ((EMBEDDING_DIM // len(h)) + 1))[:EMBEDDING_DIM]
    return [(b / 127.5) - 1.0 for b in raw]


@component
class _FakeDocEmbedder:
    """Used during indexing — embeds Documents in place."""

    @component.output_types(documents=List[Document])
    async def run(self, documents: List[Document]) -> Dict[str, Any]:
        for d in documents:
            d.embedding = _hash_embed(d.content)
        return {"documents": documents}


@component
class _FakeTextEmbedder:
    """Used during retrieval — embeds a single query string."""

    @component.output_types(embedding=List[float])
    async def run(self, query: str) -> Dict[str, Any]:
        return {"embedding": _hash_embed(query)}


def _make_pdf(path: Path, pages: List[str]) -> None:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 100), text, fontsize=12)
    doc.save(str(path))
    doc.close()


def _index_doc(
    store, document_id: str, project_id: str, filename: str, file_path: Path
) -> None:
    """Synchronous helper that runs the indexing components manually."""
    src = DocumentSource(
        document_id=document_id,
        notebook_id="nb",
        project_id=project_id,
        filename=filename,
        file_path=str(file_path),
    )
    out = FileToChunks().run(source=src)
    docs = out["documents"]
    for d in docs:
        d.embedding = _hash_embed(d.content)
    return docs


@pytest_asyncio.fixture
async def store():
    s = AsyncQdrantDocumentStore(
        url=QDRANT_URL,
        index="test_documents_retrieval",
        embedding_dim=EMBEDDING_DIM,
        recreate_index=True,
        return_embedding=False,
    )
    yield s


def _build_retrieval_pipeline(store, similarity_threshold=-1.0, top_k=8):
    """Hand-construct the retrieval pipeline with our fake text embedder.

    similarity_threshold=-1 disables score filtering so test results are
    deterministic regardless of cosine quirks at low embedding dims.
    """
    pipe = DocumentsRetrieval.__new__(DocumentsRetrieval)
    from hamilton import base
    from hamilton.async_driver import AsyncDriver
    from src.pipelines.retrieval import documents as _retmod

    pipe._components = {
        "embedder": _FakeTextEmbedder(),
        "retriever": AsyncQdrantEmbeddingRetriever(document_store=store),
        "score_filter": ScoreFilter(),
        "formatter": DocumentChunkFormatter(),
    }
    pipe._configs = {
        "similarity_threshold": similarity_threshold,
        "top_k": top_k,
    }
    pipe._pipe = AsyncDriver({}, _retmod, result_builder=base.DictResult())
    return pipe


@pytest.mark.asyncio
async def test_retrieval_returns_only_selected_documents(tmp_path: Path, store):
    pdf_a = tmp_path / "a.pdf"
    _make_pdf(pdf_a, ["Document A about strawberries."])
    pdf_b = tmp_path / "b.pdf"
    _make_pdf(pdf_b, ["Document B about strawberries too."])

    docs_a = _index_doc(store, "DOC_A", "proj-1", "a.pdf", pdf_a)
    docs_b = _index_doc(store, "DOC_B", "proj-1", "b.pdf", pdf_b)
    await store.write_documents(docs_a + docs_b, policy=DuplicatePolicy.OVERWRITE)

    pipe = _build_retrieval_pipeline(store)

    # Select only DOC_A
    result = await pipe.run(
        query="strawberries",
        selected_document_ids=["DOC_A"],
        project_id="proj-1",
    )
    out = result["formatted_output"]["documents"]
    assert len(out) >= 1
    for chunk in out:
        assert chunk["document_id"] == "DOC_A"
        assert chunk["filename"] == "a.pdf"


@pytest.mark.asyncio
async def test_retrieval_respects_project_id(tmp_path: Path, store):
    pdf = tmp_path / "x.pdf"
    _make_pdf(pdf, ["Mango juice details."])

    docs = _index_doc(store, "DOC_X", "proj-A", "x.pdf", pdf)
    await store.write_documents(docs, policy=DuplicatePolicy.OVERWRITE)

    pipe = _build_retrieval_pipeline(store)

    # Wrong project_id -> should return nothing even though doc_id matches
    result = await pipe.run(
        query="mango",
        selected_document_ids=["DOC_X"],
        project_id="proj-WRONG",
    )
    assert result["formatted_output"]["documents"] == []

    # Correct project_id -> returns chunk
    result = await pipe.run(
        query="mango",
        selected_document_ids=["DOC_X"],
        project_id="proj-A",
    )
    assert len(result["formatted_output"]["documents"]) >= 1


@pytest.mark.asyncio
async def test_retrieval_empty_selection_returns_empty(tmp_path: Path, store):
    """When user has no documents checked, retrieval is a no-op."""
    pdf = tmp_path / "x.pdf"
    _make_pdf(pdf, ["Some content."])
    docs = _index_doc(store, "DOC_X", "p", "x.pdf", pdf)
    await store.write_documents(docs, policy=DuplicatePolicy.OVERWRITE)

    pipe = _build_retrieval_pipeline(store)
    result = await pipe.run(
        query="any question",
        selected_document_ids=[],
        project_id="p",
    )
    assert result["formatted_output"]["documents"] == []


@pytest.mark.asyncio
async def test_retrieval_top_k_limits_results(tmp_path: Path, store):
    # Create one PDF with many pages -> many chunks
    pdf = tmp_path / "long.pdf"
    _make_pdf(pdf, [f"Page {i} content here." for i in range(15)])
    docs = _index_doc(store, "DOC_LONG", "p", "long.pdf", pdf)
    await store.write_documents(docs, policy=DuplicatePolicy.OVERWRITE)

    pipe = _build_retrieval_pipeline(store, top_k=3)
    result = await pipe.run(
        query="page content",
        selected_document_ids=["DOC_LONG"],
        project_id="p",
    )
    assert len(result["formatted_output"]["documents"]) == 3


@pytest.mark.asyncio
async def test_retrieval_output_shape(tmp_path: Path, store):
    """Retrieval output must have the keys the SQL prompt expects."""
    pdf = tmp_path / "shape.pdf"
    _make_pdf(pdf, ["Revenue increased by 18 percent in Q3 2025."])
    docs = _index_doc(store, "DOC_S", "p", "shape.pdf", pdf)
    await store.write_documents(docs, policy=DuplicatePolicy.OVERWRITE)

    pipe = _build_retrieval_pipeline(store)
    result = await pipe.run(
        query="revenue",
        selected_document_ids=["DOC_S"],
        project_id="p",
    )
    chunks = result["formatted_output"]["documents"]
    assert len(chunks) == 1
    chunk = chunks[0]
    assert set(chunk.keys()) >= {"document_id", "filename", "page", "text", "score"}
    assert chunk["document_id"] == "DOC_S"
    assert chunk["filename"] == "shape.pdf"
    assert chunk["page"] == 1
    assert "Revenue" in chunk["text"]
    assert isinstance(chunk["score"], float)
