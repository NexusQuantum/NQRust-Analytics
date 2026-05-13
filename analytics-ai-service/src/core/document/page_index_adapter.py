"""
Local PageIndex adapter.

Drop-in replacement for the previous hosted-API adapter. Uses a vendored
copy of the open-source VectifyAI/PageIndex engine (MIT licensed) to build
hierarchical document trees and run reasoning-based retrieval entirely
in-process — no external API key, no per-call credits.

Flow:
  index:    page_index_main(pdf)   → tree dict
  retrieve: LLM-guided traversal of the tree to pick relevant nodes,
            then return their text as RetrievedPassages.

The interface (`build_index`, `query`) and the return shapes
(`RetrievedPassage`, `RetrievalResult`) are intentionally identical to
the previous hosted adapter so the rest of the service does not need to
change.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .pageindex import page_index_main
from .pageindex.utils import (
    ConfigLoader,
    create_node_mapping,
    extract_json,
    llm_acompletion,
)

logger = logging.getLogger("analytics-service")


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
    Builds and queries a hierarchical document index using the vendored
    PageIndex engine. All LLM calls go through LiteLLM with the project's
    configured credentials — no external service.
    """

    def __init__(
        self,
        workspace_dir: str | Path = "/app/pageindex_workspace",
        indexing_model: str | None = None,
        retrieval_model: str | None = None,
        retrieval_top_k: int = 5,
    ):
        self._workspace = Path(workspace_dir)
        self._workspace.mkdir(parents=True, exist_ok=True)
        self._indexing_model = indexing_model
        self._retrieval_model = retrieval_model or indexing_model
        self._retrieval_top_k = retrieval_top_k

    # ── indexing ────────────────────────────────────────────────────────────

    def build_index(
        self, file_path: str | Path, doc_id: str | None = None
    ) -> dict:
        """
        Build a hierarchical tree for the PDF at `file_path` and return:
            {"pi_doc_id": str, "tree": dict, "page_count": int}

        `pi_doc_id` is kept for schema compatibility with the previous
        hosted-API adapter — for the local engine it's just the application
        document id (or the file stem if none was provided).
        """
        file_path = Path(file_path)
        if not file_path.is_file():
            raise FileNotFoundError(f"PDF not found: {file_path}")

        logger.info(f"Building PageIndex tree locally for {file_path.name}")
        opt = ConfigLoader().load(
            {k: v for k, v in {"model": self._indexing_model}.items() if v}
        )

        # `page_index_main` is synchronous and internally spins its own
        # event loop via asyncio.run. Running it inside an already-running
        # loop would deadlock, so callers from async contexts should
        # off-load via run_in_executor.
        result = page_index_main(str(file_path), opt)
        tree: list[dict] | dict = result.get("structure", []) if isinstance(result, dict) else result

        # Normalise the tree shape we hand back to the service layer:
        #   structure: list of root nodes (each with `title`, `nodes`, `text`, ...)
        #   doc_name:  PDF filename
        # We also embed the application doc_id so the retrieval side can
        # report it back even after a process restart.
        wrapped = {
            "doc_id": doc_id or file_path.stem,
            "doc_name": (
                result.get("doc_name")
                if isinstance(result, dict)
                else file_path.name
            ),
            "doc_description": (
                result.get("doc_description")
                if isinstance(result, dict)
                else None
            ),
            "structure": tree if isinstance(tree, list) else [],
        }

        page_count = _count_pages_from_tree(wrapped["structure"])

        return {
            "pi_doc_id": wrapped["doc_id"],
            "tree": wrapped,
            "page_count": page_count,
        }

    # ── retrieval ───────────────────────────────────────────────────────────

    def query(
        self,
        pi_doc_id: str,
        question: str,
        tree: dict | None = None,
        top_k_pages: int | None = None,
    ) -> RetrievalResult:
        """
        Reasoning-based retrieval: ask the LLM which sections of the tree
        are relevant to `question`, then return the text of those sections
        as RetrievedPassages (capped at `top_k_pages`).

        The hosted API used to do this server-side; we run it locally with
        a single LLM call per query.
        """
        if not tree:
            logger.warning(
                "No tree provided for retrieval on doc %s — returning empty",
                pi_doc_id,
            )
            return RetrievalResult(passages=[], raw_tree={})

        top_k = top_k_pages or self._retrieval_top_k
        structure = tree.get("structure") if isinstance(tree, dict) else tree
        if not isinstance(structure, list) or not structure:
            return RetrievalResult(passages=[], raw_tree=tree or {})

        try:
            selected_ids = asyncio.run(
                _select_relevant_nodes(
                    structure,
                    question,
                    top_k=top_k,
                    model=self._retrieval_model,
                )
            )
        except RuntimeError:
            # Already inside an event loop — fall back to running on a
            # separate thread's loop. Should not happen given the service
            # offloads via run_in_executor, but defensive nonetheless.
            loop = asyncio.new_event_loop()
            try:
                selected_ids = loop.run_until_complete(
                    _select_relevant_nodes(
                        structure,
                        question,
                        top_k=top_k,
                        model=self._retrieval_model,
                    )
                )
            finally:
                loop.close()

        node_map = create_node_mapping(structure)
        passages: list[RetrievedPassage] = []
        for node_id in selected_ids[:top_k]:
            node = node_map.get(node_id)
            if not node:
                continue
            passages.append(
                RetrievedPassage(
                    page_number=_first_page_of_node(node),
                    section_title=str(node.get("title") or "Section"),
                    excerpt=_extract_node_text(node)[:1200],
                )
            )

        if not passages:
            # Fallback: if the LLM returned nothing usable, surface the top
            # `top_k` root sections so the caller still has *something* to
            # answer from instead of an empty pass-through.
            for node in structure[:top_k]:
                passages.append(
                    RetrievedPassage(
                        page_number=_first_page_of_node(node),
                        section_title=str(node.get("title") or "Section"),
                        excerpt=_extract_node_text(node)[:1200],
                    )
                )

        return RetrievalResult(passages=passages, raw_tree=tree)


# ── helpers ────────────────────────────────────────────────────────────────


def _count_pages_from_tree(structure: list[dict]) -> int:
    """Highest `end_index` (1-indexed page) seen across the tree, or 0."""
    max_page = 0

    def _walk(nodes: list[dict]) -> None:
        nonlocal max_page
        for n in nodes:
            for key in ("end_index", "physical_index", "start_index"):
                value = n.get(key)
                if isinstance(value, int) and value > max_page:
                    max_page = value
            if n.get("nodes"):
                _walk(n["nodes"])

    _walk(structure)
    return max_page


def _first_page_of_node(node: dict) -> int:
    """Pick the most useful page citation for a node."""
    for key in ("start_index", "physical_index", "end_index"):
        value = node.get(key)
        if isinstance(value, int) and value > 0:
            return value
    # Fall back to walking into children
    children = node.get("nodes") or []
    if children:
        return _first_page_of_node(children[0])
    return 1


def _extract_node_text(node: dict) -> str:
    """Return concatenated text for a node and its direct descendants."""
    chunks: list[str] = []
    if isinstance(node.get("text"), str):
        chunks.append(node["text"])
    if isinstance(node.get("summary"), str) and not chunks:
        # Summary as a last resort if no raw text is embedded
        chunks.append(node["summary"])

    def _walk(children: list[dict]) -> None:
        for child in children or []:
            t = child.get("text")
            if isinstance(t, str):
                chunks.append(t)
            if child.get("nodes"):
                _walk(child["nodes"])

    _walk(node.get("nodes") or [])
    return "\n\n".join(c for c in chunks if c).strip()


def _structure_outline(structure: list[dict]) -> list[dict]:
    """Build a lightweight outline (title + node_id + summary) for the LLM."""
    outline: list[dict] = []

    def _walk(nodes: list[dict], depth: int = 0) -> None:
        for n in nodes:
            outline.append(
                {
                    "node_id": n.get("node_id"),
                    "title": n.get("title"),
                    "summary": n.get("summary"),
                    "start_index": n.get("start_index"),
                    "end_index": n.get("end_index"),
                    "depth": depth,
                }
            )
            if n.get("nodes"):
                _walk(n["nodes"], depth + 1)

    _walk(structure)
    return outline


async def _select_relevant_nodes(
    structure: list[dict],
    question: str,
    top_k: int,
    model: str | None,
) -> list[str]:
    """
    Single LLM call that picks the most relevant `node_id`s from the
    document outline. Returns a (possibly empty) list of ids.

    This mirrors the hosted PageIndex retrieval step: the model reasons
    over the *structure* (titles + summaries) rather than over chunked
    embeddings, then we hand back the matching pages' content.
    """
    outline = _structure_outline(structure)
    if not outline:
        return []

    prompt = (
        "You are selecting the document sections most relevant to a user "
        "question, from a hierarchical outline (node_id + title + summary).\n"
        f"\nUser question: {question.strip()}\n\n"
        "Outline (one node per line as JSON):\n"
        + "\n".join(json.dumps(item, ensure_ascii=False) for item in outline)
        + "\n\nReturn JSON of the form:\n"
        + '{\n  "node_ids": ["<id1>", "<id2>", ...]\n}\n'
        + f"Pick up to {top_k} node_ids. Prefer leaf sections (high `depth`) "
        + "whose title and summary directly address the question. Only return "
        + "ids that appear in the outline. If nothing is relevant, return an "
        + "empty list. Reply with the JSON object only — no prose."
    )

    raw = await llm_acompletion(model=model, prompt=prompt)
    parsed: Any
    try:
        parsed = extract_json(raw)
    except Exception:
        parsed = None

    candidate_ids: list[str] = []
    if isinstance(parsed, dict):
        ids = parsed.get("node_ids") or parsed.get("ids") or []
        if isinstance(ids, list):
            candidate_ids = [str(x) for x in ids if x]
    elif isinstance(parsed, list):
        candidate_ids = [str(x) for x in parsed if x]

    if not candidate_ids:
        # Try a permissive regex over the raw response as a last resort —
        # the model sometimes wraps the JSON in prose despite instructions.
        candidate_ids = re.findall(r'"([A-Za-z0-9._-]+)"', raw or "")

    valid_ids = {item["node_id"] for item in outline if item.get("node_id")}
    return [nid for nid in candidate_ids if nid in valid_ids][:top_k]
