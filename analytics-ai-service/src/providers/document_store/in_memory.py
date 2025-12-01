import logging
from typing import Any, Dict, List, Optional

from haystack import Document
from haystack.components.retrievers.in_memory import InMemoryEmbeddingRetriever
from haystack.document_stores.in_memory import InMemoryDocumentStore
from haystack.document_stores.types import DuplicatePolicy
from haystack.utils.filters import document_matches_filter

from src.core.provider import DocumentStoreProvider
from src.providers.loader import provider

logger = logging.getLogger("analytics-service")


class AsyncInMemoryDocumentStore(InMemoryDocumentStore):
    """
    Thin async-compatible wrapper over Haystack's InMemoryDocumentStore to match
    the async interface expected elsewhere in the service (write/delete/count).

    Note: This store is ephemeral and intended for local/dev use only.
    """

    async def delete_documents(self, filters: Optional[Dict[str, Any]] = None) -> None:
        # If no filters provided, clear all documents in this index
        if not filters:
            ids = list(self.storage.keys())
            super().delete_documents(ids)
            return

        # Delete only documents matching filters
        to_delete: List[str] = []
        for doc_id, doc in list(self.storage.items()):
            if document_matches_filter(doc, filters):
                to_delete.append(doc_id)
        if to_delete:
            super().delete_documents(to_delete)

    async def count_documents(self, filters: Optional[Dict[str, Any]] = None) -> int:
        if not filters:
            return len(self.storage)
        return sum(
            1 for doc in self.storage.values() if document_matches_filter(doc, filters)
        )

    async def write_documents(
        self, documents: List[Document], policy: DuplicatePolicy = DuplicatePolicy.NONE
    ) -> int:
        return super().write_documents(documents=documents, policy=policy)


class AsyncInMemoryEmbeddingRetriever(InMemoryEmbeddingRetriever):
    """
    Async facade over InMemoryEmbeddingRetriever to integrate with async pipelines.
    """

    async def run(
        self,
        query_embedding: List[float],
        filters: Optional[Dict[str, Any]] = None,
        top_k: Optional[int] = None,
        scale_score: Optional[bool] = None,
        return_embedding: Optional[bool] = None,
    ):
        return super().run(
            query_embedding=query_embedding,
            filters=filters,
            top_k=top_k,
            scale_score=scale_score,
            return_embedding=return_embedding,
        )


@provider("in_memory")
class InMemoryProvider(DocumentStoreProvider):
    """
    In-memory Document Store provider for local development without external dependencies.

    Creates separate indices for each dataset name to mirror Qdrant collections.
    """

    def __init__(self, embedding_model_dim: int = 0, **_):
        # embedding_model_dim is unused for in-memory store but kept for config parity
        self._embedding_model_dim = embedding_model_dim
        self._reset_document_store(recreate_index=False)

    def _reset_document_store(self, recreate_index: bool):
        # Instantiate stores so indices exist; nothing else needed for in-memory
        self.get_store(recreate_index=recreate_index)
        self.get_store(dataset_name="table_descriptions", recreate_index=recreate_index)
        self.get_store(dataset_name="view_questions", recreate_index=recreate_index)
        self.get_store(dataset_name="sql_pairs", recreate_index=recreate_index)
        self.get_store(dataset_name="instructions", recreate_index=recreate_index)
        self.get_store(dataset_name="project_meta", recreate_index=recreate_index)

    def get_store(
        self,
        dataset_name: Optional[str] = None,
        recreate_index: bool = False,
    ):
        index = dataset_name or "Document"
        if recreate_index:
            # Clear any existing docs under this index by creating a fresh instance and wiping storage
            store = AsyncInMemoryDocumentStore(index=index)
            ids = list(store.storage.keys())
            if ids:
                store.delete_documents(ids)  # type: ignore[arg-type]
            return store

        return AsyncInMemoryDocumentStore(index=index)

    def get_retriever(
        self, document_store: AsyncInMemoryDocumentStore, top_k: int = 10
    ):
        # Use scale_score=True to align with score filtering thresholds (0..1)
        return AsyncInMemoryEmbeddingRetriever(
            document_store=document_store,
            top_k=top_k,
            scale_score=True,
        )
