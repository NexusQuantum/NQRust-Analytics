"""Verify the documents router is wired into the app correctly.

We don't boot the full ServiceContainer here (that requires Qdrant + LLM
keys); instead we inspect the FastAPI app's route table directly.
"""
from src.__main__ import app


def _route_paths_and_methods():
    routes = []
    for r in app.routes:
        if hasattr(r, "path") and hasattr(r, "methods"):
            for m in r.methods:
                routes.append((m, r.path))
    return routes


def test_documents_index_route_registered():
    paths = _route_paths_and_methods()
    assert ("POST", "/v1/documents/index") in paths


def test_documents_status_route_registered():
    paths = _route_paths_and_methods()
    assert ("GET", "/v1/documents/{document_id}/status") in paths


def test_documents_delete_route_registered():
    paths = _route_paths_and_methods()
    assert ("DELETE", "/v1/documents/{document_id}") in paths


def test_ask_route_still_registered():
    """Ensure no regression: /v1/asks (existing) is still there."""
    paths = _route_paths_and_methods()
    assert ("POST", "/v1/asks") in paths
