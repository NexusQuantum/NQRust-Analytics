"""Document ingestion utilities: parse, chunk, hash.

Adapted from OpenKB (d:/Project/OpenKB/openkb/) for use in the
NotebookLM-style document RAG feature.
"""
from src.core.document.parser import parse_document, get_pdf_page_count, ParseResult
from src.core.document.chunker import chunk_pages, Chunk
from src.core.document.hash import hash_file

__all__ = [
    "parse_document",
    "get_pdf_page_count",
    "ParseResult",
    "chunk_pages",
    "Chunk",
    "hash_file",
]
