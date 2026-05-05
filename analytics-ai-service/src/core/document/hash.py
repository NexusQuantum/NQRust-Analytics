"""SHA-256 hashing of files for deduplication.

Adapted from OpenKB state.py (HashRegistry.hash_file).
The persistence layer is the analytics-ui database (`documents.hash` column),
so only the static hashing utility is needed here.
"""
from __future__ import annotations

import hashlib
from pathlib import Path


def hash_file(path: Path) -> str:
    """Return the SHA-256 hex digest (64 chars) of the file at *path*."""
    h = hashlib.sha256()
    with path.open("rb") as fh:
        for chunk in iter(lambda: fh.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()
