import hashlib
import logging
from functools import lru_cache

from cachetools import LRUCache

logger = logging.getLogger("analytics-service")

# In-memory LRU caches keyed by (doc_id, question_hash)
# Tree cache: doc_id → parsed tree dict
_tree_cache: LRUCache = LRUCache(maxsize=100)

# Retrieval cache: (doc_id, question_hash) → list[RetrievedPassage]
_retrieval_cache: LRUCache = LRUCache(maxsize=500)


def get_cached_tree(doc_id: str) -> dict | None:
    return _tree_cache.get(doc_id)


def set_cached_tree(doc_id: str, tree: dict) -> None:
    _tree_cache[doc_id] = tree


def _question_hash(question: str) -> str:
    return hashlib.md5(question.encode()).hexdigest()


def get_cached_retrieval(doc_id: str, question: str):
    key = (doc_id, _question_hash(question))
    return _retrieval_cache.get(key)


def set_cached_retrieval(doc_id: str, question: str, result) -> None:
    key = (doc_id, _question_hash(question))
    _retrieval_cache[key] = result


def invalidate_document(doc_id: str) -> None:
    """Remove all cached data for a document (called on delete/reindex)."""
    _tree_cache.pop(doc_id, None)
    keys_to_remove = [k for k in _retrieval_cache if k[0] == doc_id]
    for k in keys_to_remove:
        _retrieval_cache.pop(k, None)
    logger.info(f"Cache invalidated for document {doc_id}")
