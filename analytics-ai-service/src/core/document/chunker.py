"""Chunk per-page document text for embedding.

Strategy: page-based as the natural boundary; recursively split a page
that exceeds max_tokens. Token counting uses tiktoken (already a project
dependency for SQL token accounting).
"""
from __future__ import annotations

from dataclasses import dataclass

import tiktoken

# cl100k_base matches GPT-4 / GPT-4o tokenization; close enough for any
# embedding model's actual budget. Used only for splitting decisions.
_ENCODER = tiktoken.get_encoding("cl100k_base")

DEFAULT_MAX_TOKENS = 800
DEFAULT_OVERLAP_TOKENS = 80


@dataclass
class Chunk:
    page: int
    chunk_index: int  # index within the page
    text: str


def chunk_pages(
    pages: list[dict],
    max_tokens: int = DEFAULT_MAX_TOKENS,
    overlap_tokens: int = DEFAULT_OVERLAP_TOKENS,
) -> list[Chunk]:
    """Convert per-page records into chunks suitable for embedding.

    A page that fits within max_tokens becomes a single chunk. A page
    exceeding max_tokens is split into multiple chunks with overlap.
    Empty pages are skipped.
    """
    chunks: list[Chunk] = []

    for page_record in pages:
        page_num = page_record["page"]
        content = page_record["content"].strip()
        if not content:
            continue

        token_ids = _ENCODER.encode(content)
        if len(token_ids) <= max_tokens:
            chunks.append(Chunk(page=page_num, chunk_index=0, text=content))
            continue

        # Page is too long; sliding window split.
        stride = max_tokens - overlap_tokens
        idx = 0
        chunk_idx = 0
        while idx < len(token_ids):
            window_ids = token_ids[idx : idx + max_tokens]
            chunk_text = _ENCODER.decode(window_ids)
            chunks.append(Chunk(page=page_num, chunk_index=chunk_idx, text=chunk_text))
            chunk_idx += 1
            if idx + max_tokens >= len(token_ids):
                break
            idx += stride

    return chunks
