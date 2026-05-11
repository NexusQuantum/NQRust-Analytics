import hashlib
import logging
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("analytics-service")


@dataclass
class ParsedPage:
    page_number: int
    text: str


@dataclass
class ParsedDocument:
    file_hash: str
    filename: str
    page_count: int
    pages: list[ParsedPage]


def parse_pdf(file_path: str | Path) -> ParsedDocument:
    """Extract text page-by-page from a PDF. Raises ValueError if file is invalid."""
    from pypdf import PdfReader

    path = Path(file_path)
    if not path.exists():
        raise FileNotFoundError(f"File not found: {path}")

    file_bytes = path.read_bytes()
    file_hash = hashlib.sha256(file_bytes).hexdigest()

    try:
        reader = PdfReader(path)
    except Exception as exc:
        raise ValueError(f"Cannot parse PDF: {exc}") from exc

    pages: list[ParsedPage] = []
    for i, page in enumerate(reader.pages, start=1):
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        pages.append(ParsedPage(page_number=i, text=text.strip()))

    return ParsedDocument(
        file_hash=file_hash,
        filename=path.name,
        page_count=len(pages),
        pages=pages,
    )
