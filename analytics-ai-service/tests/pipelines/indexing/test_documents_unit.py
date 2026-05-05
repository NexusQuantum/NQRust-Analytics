"""Unit tests for the documents indexing pipeline components.

These tests don't require Qdrant or any embedding model — they verify
the parse + chunk + Document construction path in isolation.
"""
from pathlib import Path

import pymupdf

from src.pipelines.indexing.documents import DocumentSource, FileToChunks


def _make_pdf(path: Path, pages: list[str]) -> None:
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 100), text, fontsize=12)
    doc.save(str(path))
    doc.close()


def test_file_to_chunks_emits_haystack_documents(tmp_path: Path):
    pdf = tmp_path / "intro.pdf"
    _make_pdf(pdf, ["First page introduction.", "Second page details."])

    src = DocumentSource(
        document_id="doc-42",
        notebook_id="nb-1",
        project_id="proj-1",
        filename="intro.pdf",
        file_path=str(pdf),
    )

    out = FileToChunks().run(source=src)
    docs = out["documents"]
    assert len(docs) == 2

    for d, expected_page in zip(docs, [1, 2]):
        assert d.meta["document_id"] == "doc-42"
        assert d.meta["notebook_id"] == "nb-1"
        assert d.meta["project_id"] == "proj-1"
        assert d.meta["filename"] == "intro.pdf"
        assert d.meta["page"] == expected_page
        assert d.meta["chunk_index"] == 0
        assert d.id  # uuid generated
        assert d.content


def test_file_to_chunks_skips_empty_pages(tmp_path: Path):
    pdf = tmp_path / "sparse.pdf"
    # pymupdf insert_text with empty string still creates the page; first
    # page intentionally has only whitespace which the parser strips.
    doc = pymupdf.open()
    doc.new_page()  # blank
    p2 = doc.new_page()
    p2.insert_text((50, 100), "Real content here.", fontsize=12)
    doc.save(str(pdf))
    doc.close()

    src = DocumentSource(
        document_id="d",
        notebook_id="n",
        project_id="p",
        filename="sparse.pdf",
        file_path=str(pdf),
    )
    out = FileToChunks().run(source=src)
    docs = out["documents"]
    assert len(docs) == 1
    assert docs[0].meta["page"] == 2
    assert "Real content here" in docs[0].content


def test_file_to_chunks_markdown(tmp_path: Path):
    md = tmp_path / "note.md"
    md.write_text("# Title\n\nBody text.", encoding="utf-8")
    src = DocumentSource(
        document_id="d-md",
        notebook_id="n",
        project_id="p",
        filename="note.md",
        file_path=str(md),
    )
    out = FileToChunks().run(source=src)
    docs = out["documents"]
    assert len(docs) == 1
    assert docs[0].meta["page"] == 1
    assert "# Title" in docs[0].content
