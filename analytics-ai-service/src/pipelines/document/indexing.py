import asyncio
import logging
from pathlib import Path
from typing import Any, Callable, Optional

from src.core.document.cache import set_cached_tree
from src.core.document.page_index_adapter import PageIndexAdapter
from src.core.pipeline import BasicPipeline

logger = logging.getLogger("analytics-service")


class DocumentIndexing(BasicPipeline):
    """
    Indexes a PDF using PageIndex: parse → build tree → store tree JSON.

    This pipeline is intentionally NOT Hamilton-based because its flow is
    sequential with a single external call (PageIndex) rather than a DAG.
    The on_complete callback is used to POST the resulting tree JSON back
    to analytics-ui without blocking the caller.
    """

    def __init__(
        self,
        api_key: str,
        workspace_dir: str | Path,
        model: str = "gpt-4o-mini",
        on_complete: Optional[Callable[[str, dict, int], Any]] = None,
        **kwargs,
    ):
        self._adapter = PageIndexAdapter(api_key=api_key, workspace_dir=workspace_dir)
        self._on_complete = on_complete
        super().__init__(pipe=None)  # type: ignore[arg-type]

    async def run(
        self,
        document_id: str,
        file_path: str | Path,
        callback_url: Optional[str] = None,
    ) -> dict:
        """
        Index document asynchronously. Calls on_complete when done.

        Args:
            document_id: Our internal document ID (used in callback)
            file_path: Path to the PDF file on disk
            callback_url: Optional URL to POST status to (analytics-ui REST endpoint)

        Returns:
            {"status": "ok", "document_id": document_id, "page_count": N}
        """
        loop = asyncio.get_event_loop()

        try:
            logger.info(f"Starting document indexing for {document_id}")

            # PageIndex is sync — run in thread pool to not block the event loop
            result = await loop.run_in_executor(
                None,
                self._adapter.build_index,
                str(file_path),
                document_id,
            )

            pi_doc_id = result["pi_doc_id"]
            tree = result["tree"]
            page_count = result.get("page_count") or self._count_pages(tree)

            # Embed pi_doc_id into tree so retrieval can find it later
            tree["_pi_doc_id"] = pi_doc_id

            # Cache tree in memory
            set_cached_tree(document_id, tree)

            # Fire callback if provided
            if self._on_complete:
                try:
                    await self._on_complete(document_id, tree, page_count)
                except Exception as e:
                    logger.error(f"on_complete callback failed for {document_id}: {e}")

            # POST result back to UI callback URL
            if callback_url:
                await self._post_callback(callback_url, document_id, tree, page_count)

            logger.info(f"Document {document_id} indexed successfully ({page_count} pages)")
            return {"status": "ok", "document_id": document_id, "page_count": page_count, "tree": tree}

        except Exception as e:
            logger.error(f"Document indexing failed for {document_id}: {e}")
            if self._on_complete:
                try:
                    await self._on_complete(document_id, {}, 0, error=str(e))
                except Exception:
                    pass
            if callback_url:
                await self._post_callback(callback_url, document_id, {}, 0, error=str(e))
            raise

    async def _post_callback(
        self,
        callback_url: str,
        document_id: str,
        tree: dict,
        page_count: int,
        error: str | None = None,
    ) -> None:
        import json
        import aiohttp

        payload: dict = {
            "page_count": page_count,
            "error": error,
        }
        if tree and not error:
            payload["tree_json"] = json.dumps(tree)

        try:
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    callback_url,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=30),
                ) as resp:
                    if resp.status >= 400:
                        text = await resp.text()
                        logger.warning(f"Callback to {callback_url} returned {resp.status}: {text}")
                    else:
                        logger.info(f"Callback to {callback_url} succeeded")
        except Exception as e:
            logger.error(f"Callback POST to {callback_url} failed: {e}")

    def _count_pages(self, tree: dict) -> int:
        """Best-effort page count from tree metadata."""
        if "page_count" in tree:
            return tree["page_count"]
        # Walk tree to find max page_end
        max_page = 0
        def _walk(node):
            nonlocal max_page
            max_page = max(max_page, node.get("page_end", 0))
            for c in node.get("children", []):
                _walk(c)
        _walk(tree)
        return max_page or 0
