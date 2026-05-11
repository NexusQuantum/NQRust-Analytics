import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path

logger = logging.getLogger("analytics-service")

# How long to poll for retrieval_ready before giving up (seconds)
_READY_TIMEOUT = 300
_READY_POLL_INTERVAL = 5


@dataclass
class RetrievedPassage:
    page_number: int
    section_title: str
    excerpt: str


@dataclass
class RetrievalResult:
    passages: list[RetrievedPassage]
    raw_tree: dict


class PageIndexAdapter:
    """
    Wrapper around the PageIndex hosted API (api.pageindex.ai).

    Flow:
      index:    submit_document() → poll is_retrieval_ready() → get_tree()
      retrieve: submit_query()    → poll get_retrieval() until ready
    """

    def __init__(self, api_key: str, workspace_dir: str | Path = "/tmp/pageindex_workspace"):
        self._api_key = api_key
        self._workspace = Path(workspace_dir)
        self._workspace.mkdir(parents=True, exist_ok=True)
        self._client = None

    def _get_client(self):
        if self._client is None:
            from pageindex import PageIndexClient
            self._client = PageIndexClient(api_key=self._api_key)
        return self._client

    def build_index(self, file_path: str | Path, doc_id: str | None = None) -> dict:
        """
        Upload PDF to PageIndex, wait until ready, return tree JSON.
        Returns: {"pi_doc_id": str, "tree": dict, "page_count": int}
        """
        client = self._get_client()
        file_path = Path(file_path)

        logger.info(f"Submitting {file_path.name} to PageIndex API")
        result = client.submit_document(str(file_path))
        pi_doc_id = result["doc_id"]
        logger.info(f"PageIndex doc_id={pi_doc_id}, waiting for retrieval_ready")

        # Poll until retrieval_ready
        deadline = time.time() + _READY_TIMEOUT
        while time.time() < deadline:
            if client.is_retrieval_ready(pi_doc_id):
                break
            time.sleep(_READY_POLL_INTERVAL)
        else:
            raise TimeoutError(f"PageIndex document {pi_doc_id} not ready after {_READY_TIMEOUT}s")

        tree_resp = client.get_tree(pi_doc_id)
        tree = tree_resp if isinstance(tree_resp, dict) else json.loads(tree_resp)

        # page count from document metadata
        try:
            meta = client.get_document(pi_doc_id)
            page_count = meta.get("pageNum", 0)
        except Exception:
            page_count = 0

        return {"pi_doc_id": pi_doc_id, "tree": tree, "page_count": page_count}

    def query(
        self,
        pi_doc_id: str,
        question: str,
        tree: dict | None = None,
        top_k_pages: int = 5,
    ) -> RetrievalResult:
        """
        Submit a retrieval query and poll until results are ready.
        Returns top_k_pages passages with page citations.
        """
        client = self._get_client()

        if tree is None:
            tree_resp = client.get_tree(pi_doc_id)
            tree = tree_resp if isinstance(tree_resp, dict) else json.loads(tree_resp)

        logger.info(f"Submitting retrieval query for doc {pi_doc_id}")
        submit_resp = client.submit_query(pi_doc_id, question)
        retrieval_id = submit_resp["retrieval_id"]

        # Poll until retrieval is done
        deadline = time.time() + 120
        retrieval_data = None
        while time.time() < deadline:
            retrieval_data = client.get_retrieval(retrieval_id)
            status = retrieval_data.get("status", "")
            if status in ("completed", "done", "ready") or retrieval_data.get("passages") or retrieval_data.get("results"):
                break
            if status == "failed":
                raise RuntimeError(f"PageIndex retrieval {retrieval_id} failed")
            time.sleep(2)

        logger.info(f"PageIndex retrieval raw keys: {list((retrieval_data or {}).keys())}")
        nodes = (retrieval_data or {}).get("retrieved_nodes", [])
        if nodes:
            logger.info(f"PageIndex first node keys: {list(nodes[0].keys())}")
            logger.info(f"PageIndex first node: {str(nodes[0])[:800]}")
        passages = self._parse_retrieval(retrieval_data, top_k_pages)
        logger.info(f"Parsed {len(passages)} passages from retrieval")
        return RetrievalResult(passages=passages, raw_tree=tree)

    def _parse_retrieval(self, data: dict, top_k: int) -> list[RetrievedPassage]:
        """Parse PageIndex retrieval response into RetrievedPassage list."""
        if not data:
            return []

        # PageIndex returns retrieved_nodes; fall back to other common shapes
        raw_passages = (
            data.get("retrieved_nodes")
            or data.get("passages")
            or data.get("results")
            or data.get("nodes")
            or []
        )

        passages = []
        for item in raw_passages[:top_k]:
            if not isinstance(item, dict):
                continue

            section_title = item.get("title") or "Section"

            # Extract content from relevant_contents (PageIndex actual structure)
            # relevant_contents: [[{section_title, physical_index, relevant_content}]]
            excerpt = ""
            page_number = 1
            relevant_contents = item.get("relevant_contents") or []
            for group in relevant_contents:
                if not isinstance(group, list):
                    continue
                for rc in group:
                    if not isinstance(rc, dict):
                        continue
                    text = rc.get("relevant_content") or rc.get("content") or ""
                    if text:
                        excerpt += text + "\n\n"
                    # extract page number from physical_index like "<physical_index_5>"
                    if not page_number or page_number == 1:
                        phys = rc.get("physical_index") or ""
                        import re as _re
                        m = _re.search(r"(\d+)", str(phys))
                        if m:
                            page_number = int(m.group(1))

            # Fallback: metadata[3] is doc description, skip it; use title
            if not excerpt:
                excerpt = item.get("content") or item.get("text") or ""

            passages.append(RetrievedPassage(
                page_number=int(page_number),
                section_title=str(section_title),
                excerpt=str(excerpt)[:1200],
            ))

        return passages
