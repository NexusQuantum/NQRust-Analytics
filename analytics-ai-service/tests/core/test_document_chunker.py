"""Smoke tests for document chunker.

Run after Poetry install:
    poetry run pytest tests/core/test_document_chunker.py -v
"""
from src.core.document.chunker import chunk_pages, DEFAULT_MAX_TOKENS


def test_short_page_becomes_single_chunk():
    pages = [{"page": 1, "content": "Hello world. Short page."}]
    chunks = chunk_pages(pages)
    assert len(chunks) == 1
    assert chunks[0].page == 1
    assert chunks[0].chunk_index == 0
    assert chunks[0].text == "Hello world. Short page."


def test_empty_page_skipped():
    pages = [{"page": 1, "content": ""}, {"page": 2, "content": "real content"}]
    chunks = chunk_pages(pages)
    assert len(chunks) == 1
    assert chunks[0].page == 2


def test_long_page_split_with_overlap():
    long_text = " ".join(["word"] * 5000)  # ~5000 tokens
    pages = [{"page": 1, "content": long_text}]
    chunks = chunk_pages(pages, max_tokens=800, overlap_tokens=80)
    assert len(chunks) > 1
    # All chunks belong to page 1
    assert all(c.page == 1 for c in chunks)
    # chunk_index increases sequentially
    assert [c.chunk_index for c in chunks] == list(range(len(chunks)))


def test_multi_page_preserves_page_numbers():
    pages = [
        {"page": 1, "content": "page one content"},
        {"page": 2, "content": "page two content"},
        {"page": 3, "content": "page three content"},
    ]
    chunks = chunk_pages(pages)
    assert [c.page for c in chunks] == [1, 2, 3]


def test_default_max_tokens_sane():
    assert 200 <= DEFAULT_MAX_TOKENS <= 2000
