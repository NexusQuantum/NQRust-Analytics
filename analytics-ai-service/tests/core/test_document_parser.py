"""Smoke tests for document parser (requires pymupdf + markitdown)."""
from pathlib import Path

import pymupdf
import pytest

from src.core.document.parser import parse_document, get_pdf_page_count


def _make_simple_pdf(path: Path, pages: list[str]) -> None:
    """Create a minimal PDF with given text per page."""
    doc = pymupdf.open()
    for text in pages:
        page = doc.new_page()
        page.insert_text((50, 100), text, fontsize=12)
    doc.save(str(path))
    doc.close()


def test_parse_pdf_returns_per_page_text(tmp_path: Path):
    pdf = tmp_path / "sample.pdf"
    _make_simple_pdf(pdf, ["Hello page one.", "Second page content."])

    result = parse_document(pdf)
    assert result.page_count == 2
    assert len(result.pages) == 2
    assert result.pages[0]["page"] == 1
    assert "Hello page one" in result.pages[0]["content"]
    assert result.pages[1]["page"] == 2
    assert "Second page content" in result.pages[1]["content"]


def test_get_pdf_page_count(tmp_path: Path):
    pdf = tmp_path / "p.pdf"
    _make_simple_pdf(pdf, ["a", "b", "c", "d", "e"])
    assert get_pdf_page_count(pdf) == 5


def test_parse_markdown(tmp_path: Path):
    md = tmp_path / "note.md"
    md.write_text("# Heading\n\nSome content here.", encoding="utf-8")
    result = parse_document(md)
    assert result.page_count == 1
    assert "# Heading" in result.pages[0]["content"]


def test_parse_text(tmp_path: Path):
    txt = tmp_path / "plain.txt"
    txt.write_text("plain text body", encoding="utf-8")
    result = parse_document(txt)
    assert result.page_count == 1
    assert result.pages[0]["content"] == "plain text body"
