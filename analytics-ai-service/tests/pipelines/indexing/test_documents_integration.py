"""Integration test for the documents indexing pipeline against real Qdrant.

Requires Qdrant running at http://localhost:6333. Skipped automatically
if Qdrant is unreachable so unit-test runs stay green offline.

Uses a hash-based deterministic mock embedder so the test doesn't need
any external LLM/embedding API key.
"""
from __future__ import annotations

import asyncio
import hashlib
from pathlib import Path
from typing import Any, Dict, List

import pymupdf
import pytest
import pytest_asyncio
from haystack import Document, component
from haystack.document_stores.types import DuplicatePolicy
from src.providers.document_store.qdrant import AsyncQdrantDocumentStore

from src.pipelines.indexing.documents import (
    Documents,
    DocumentSource,
    DocumentChunksCleaner,
    FileToChunks,
)


QDRANT_URL = "http://localhost:6333"
EMBEDDING_DIM = 64  # tiny dim — fast & enough to verify wiring


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
    """Deterministic hash-based embedding (no external API)."""
    h = hashlib.sha256(text.encode("utf-8")).digest()
    # Repeat hash bytes to fill EMBEDDING_DIM, normalize to [-1, 1]
    raw = (h * ((EMBEDDING_DIM // len(h)) + 1))[:EMBEDDING_DIM]
    return [(b / 127.5) - 1.0 for b in raw]


@component
class _FakeEmbedder:
    @component.output_types(documents=List[Document])
    async def run(self, documents: List[Document]) -> Dict[str, Any]:
        for d in documents:
            d.embedding = _hash_embed(d.content)
        return {"documents": documents}


def _make_pdf(path: Path, pages: List[str]) -> None:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 100), text, fontsize=12)
    doc.save(str(path))
    doc.close()


@pytest_asyncio.fixture
async def store():
    """Fresh per-test Qdrant collection, recreated to wipe prior state."""
    s = AsyncQdrantDocumentStore(
        url=QDRANT_URL,
        index="test_documents_integration",
        embedding_dim=EMBEDDING_DIM,
        recreate_index=True,
        return_embedding=False,
    )
    yield s


def _build_pipeline_with(store) -> Documents:
    """Hand-construct Documents pipeline bypassing provider wiring.

    Provider wiring is exercised in Phase 5 when the service container is
    integrated; here we test the DAG itself end-to-end.
    """
    # Build a minimal subclass that injects our store + fake embedder
    pipe = Documents.__new__(Documents)
    from hamilton import base
    from hamilton.async_driver import AsyncDriver
    import sys
    from src.pipelines.indexing import AsyncDocumentWriter

    pipe._components = {
        "file_to_chunks": FileToChunks(),
        "embedder": _FakeEmbedder(),
        "cleaner": DocumentChunksCleaner(store),
        "writer": AsyncDocumentWriter(
            document_store=store, policy=DuplicatePolicy.OVERWRITE
        ),
    }
    from src.pipelines.indexing import documents as _docmod

    pipe._pipe = AsyncDriver({}, _docmod, result_builder=base.DictResult())
    return pipe


@pytest.mark.asyncio
async def test_index_pdf_writes_chunks_to_qdrant(tmp_path: Path, store):
    pdf = tmp_path / "report.pdf"
    _make_pdf(pdf, ["Q3 revenue up 18%.", "Forecast 2026 strong growth."])

    pipe = _build_pipeline_with(store)
    src = DocumentSource(
        document_id="doc-int-1",
        notebook_id="nb-1",
        project_id="proj-1",
        filename="report.pdf",
        file_path=str(pdf),
    )
    result = await pipe.run(source=src)
    assert result["write"]["documents_written"] == 2

    # Read back via store filter
    docs = await store._query_by_filters(
        {
            "operator": "AND",
            "conditions": [
                {"field": "document_id", "operator": "==", "value": "doc-int-1"}
            ],
        }
    )
    assert len(docs) == 2
    pages = sorted(d.meta["page"] for d in docs)
    assert pages == [1, 2]
    for d in docs:
        assert d.meta["notebook_id"] == "nb-1"
        assert d.meta["project_id"] == "proj-1"
        assert d.meta["filename"] == "report.pdf"


@pytest.mark.asyncio
async def test_reindex_replaces_old_chunks(tmp_path: Path, store):
    pdf_v1 = tmp_path / "v1.pdf"
    _make_pdf(pdf_v1, ["Old version page A.", "Old page B.", "Old page C."])
    pdf_v2 = tmp_path / "v2.pdf"
    _make_pdf(pdf_v2, ["New version content."])

    pipe = _build_pipeline_with(store)
    same_id = "doc-replace"

    await pipe.run(
        source=DocumentSource(
            document_id=same_id,
            notebook_id="n",
            project_id="p",
            filename="v1.pdf",
            file_path=str(pdf_v1),
        )
    )
    docs_v1 = await store._query_by_filters(
        {"operator": "AND", "conditions": [{"field": "document_id", "operator": "==", "value": same_id}]}
    )
    assert len(docs_v1) == 3

    await pipe.run(
        source=DocumentSource(
            document_id=same_id,
            notebook_id="n",
            project_id="p",
            filename="v2.pdf",
            file_path=str(pdf_v2),
        )
    )
    docs_v2 = await store._query_by_filters(
        {"operator": "AND", "conditions": [{"field": "document_id", "operator": "==", "value": same_id}]}
    )
    assert len(docs_v2) == 1
    assert "New version content" in docs_v2[0].content


@pytest.mark.asyncio
async def test_clean_removes_only_target_document(tmp_path: Path, store):
    pdf_a = tmp_path / "a.pdf"
    _make_pdf(pdf_a, ["A page."])
    pdf_b = tmp_path / "b.pdf"
    _make_pdf(pdf_b, ["B page."])

    pipe = _build_pipeline_with(store)
    await pipe.run(
        source=DocumentSource(
            document_id="A", notebook_id="n", project_id="p", filename="a.pdf", file_path=str(pdf_a)
        )
    )
    await pipe.run(
        source=DocumentSource(
            document_id="B", notebook_id="n", project_id="p", filename="b.pdf", file_path=str(pdf_b)
        )
    )

    await pipe.clean(document_id="A")

    a_docs = await store._query_by_filters(
        {"operator": "AND", "conditions": [{"field": "document_id", "operator": "==", "value": "A"}]}
    )
    b_docs = await store._query_by_filters(
        {"operator": "AND", "conditions": [{"field": "document_id", "operator": "==", "value": "B"}]}
    )
    assert len(a_docs) == 0
    assert len(b_docs) == 1
