"""Smoke tests for document hash."""
from pathlib import Path

from src.core.document.hash import hash_file


def test_hash_is_deterministic(tmp_path: Path):
    p = tmp_path / "x.txt"
    p.write_bytes(b"hello world")
    h1 = hash_file(p)
    h2 = hash_file(p)
    assert h1 == h2
    assert len(h1) == 64  # sha256 hex


def test_hash_differs_for_different_content(tmp_path: Path):
    a = tmp_path / "a.txt"
    b = tmp_path / "b.txt"
    a.write_bytes(b"content A")
    b.write_bytes(b"content B")
    assert hash_file(a) != hash_file(b)


def test_hash_known_value(tmp_path: Path):
    # SHA-256 of "hello world" = b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
    p = tmp_path / "k.txt"
    p.write_bytes(b"hello world")
    assert hash_file(p) == "b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9"
