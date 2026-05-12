import asyncio
import logging
from pathlib import Path

from src.core.document.cache import get_cached_retrieval, get_cached_tree, set_cached_retrieval
from src.core.document.page_index_adapter import PageIndexAdapter, RetrievalResult
from src.core.pipeline import BasicPipeline

logger = logging.getLogger("analytics-service")


class DocumentRetrieval(BasicPipeline):
    """
    Retrieves relevant passages from indexed documents for a given question.

    Uses the PageIndex tree (loaded from cache or provided) to do LLM-guided
    section selection, then fetches page content for each selected section.
    """

    def __init__(
        self,
        api_key: str,
        workspace_dir: str | Path,
        model: str = "gpt-4o-mini",
        top_k_pages: int = 5,
        **kwargs,
    ):
        self._adapter = PageIndexAdapter(api_key=api_key, workspace_dir=workspace_dir)
        self._top_k = top_k_pages
        super().__init__(pipe=None)  # type: ignore[arg-type]

    async def run(
        self,
        question: str,
        document_ids: list[str],
        trees: dict[str, dict] | None = None,
    ) -> dict:
        """
        Retrieve passages from multiple documents in parallel.

        Args:
            question: User's question
            document_ids: List of document IDs to search
            trees: Optional pre-loaded trees keyed by document_id (avoids DB lookup)

        Returns:
            {"passages": [{"document_id": ..., "page_number": ..., "section_title": ..., "excerpt": ...}]}
        """
        if not document_ids:
            return {"passages": []}

        tasks = []
        for doc_id in document_ids:
            tree = (trees or {}).get(doc_id) or get_cached_tree(doc_id)
            tasks.append(self._retrieve_one(question, doc_id, tree))

        results = await asyncio.gather(*tasks, return_exceptions=True)

        passages = []
        errors: list[str] = []
        for doc_id, result in zip(document_ids, results):
            if isinstance(result, Exception):
                logger.error(f"Retrieval failed for document {doc_id}: {result}")
                errors.append(str(result))
                continue
            for p in result.passages:
                passages.append({
                    "document_id": doc_id,
                    "page_number": p.page_number,
                    "section_title": p.section_title,
                    "excerpt": p.excerpt,
                })

        # Surface infrastructure errors (e.g. PageIndex credit exhaustion) so
        # the caller can show a useful message instead of the generic
        # "documents don't contain sufficient information" — that wording
        # blames the documents/question when the real issue is upstream.
        error_message: str | None = None
        if not passages and errors:
            combined = " ".join(errors).lower()
            if "insufficient credits" in combined or "insufficientcredits" in combined:
                error_message = (
                    "Document retrieval service has insufficient credits. "
                    "Please top up your PageIndex subscription to continue."
                )
            elif "not found" in combined:
                error_message = (
                    "Document not found in the retrieval index. "
                    "Try re-indexing the affected documents."
                )
            else:
                error_message = (
                    "Document retrieval failed. Check the analytics-ai-service "
                    "logs for details."
                )

        return {"passages": passages, "error_message": error_message}

    async def _retrieve_one(
        self, question: str, doc_id: str, tree: dict | None
    ) -> RetrievalResult:
        cached = get_cached_retrieval(doc_id, question)
        if cached is not None:
            return cached

        # Resolve the PageIndex doc ID — stored inside the tree at indexing time
        if tree is None:
            tree = get_cached_tree(doc_id)
        pi_doc_id = (tree or {}).get("_pi_doc_id") if tree else None
        if not pi_doc_id:
            raise ValueError(
                f"No PageIndex doc ID found for document {doc_id}. "
                "Document may need to be re-indexed."
            )

        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            self._adapter.query,
            pi_doc_id,
            question,
            tree,
            self._top_k,
        )
        set_cached_retrieval(doc_id, question, result)
        return result
