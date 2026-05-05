"""Document parsing: convert source files to per-page text.

Adapted from OpenKB converter.py / images.py. Image extraction is dropped
since we only embed text for RAG retrieval. Output is always a list of
per-page records: [{"page": int, "content": str}, ...].

For PDFs: pymupdf dict-mode block iteration preserves reading order.
For everything else: MarkItDown returns one combined markdown blob,
which we treat as a single "page".
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from pathlib import Path

import pymupdf
from markitdown import MarkItDown

logger = logging.getLogger(__name__)


@dataclass
class ParseResult:
    pages: list[dict]  # [{"page": int, "content": str}]
    page_count: int


def get_pdf_page_count(path: Path) -> int:
    with pymupdf.open(str(path)) as doc:
        return doc.page_count


def parse_document(src: Path) -> ParseResult:
    """Parse a document file into per-page text records.

    Supported via direct PyMuPDF: .pdf
    Supported via MarkItDown: .docx, .pptx, .xlsx, .html, .htm
    Read directly: .md, .txt
    """
    suffix = src.suffix.lower()

    if suffix == ".pdf":
        pages = _parse_pdf(src)
    elif suffix in {".md", ".markdown", ".txt"}:
        text = src.read_text(encoding="utf-8", errors="replace")
        pages = [{"page": 1, "content": text}]
    else:
        # docx, pptx, xlsx, html, etc.
        mid = MarkItDown()
        result = mid.convert(str(src))
        pages = [{"page": 1, "content": result.text_content or ""}]

    return ParseResult(pages=pages, page_count=len(pages))


def _parse_pdf(pdf_path: Path) -> list[dict]:
    """Extract text per page from a PDF using pymupdf dict-mode."""
    pages: list[dict] = []

    with pymupdf.open(str(pdf_path)) as doc:
        for page_idx in range(len(doc)):
            page = doc[page_idx]
            page_num = page_idx + 1
            parts: list[str] = []

            for block in page.get_text("dict")["blocks"]:
                if block["type"] != 0:  # text block only; skip images
                    continue
                for line in block["lines"]:
                    line_text = "".join(span["text"] for span in line["spans"])
                    if line_text.strip():
                        parts.append(line_text)

            pages.append({"page": page_num, "content": "\n".join(parts)})

    return pages
