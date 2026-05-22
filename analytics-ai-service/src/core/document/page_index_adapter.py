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
from io import BytesIO
from pathlib import Path
from typing import Any

import pymupdf
import pytesseract
from PIL import Image

from .converter import ConversionError, docx_to_markdown, pptx_to_markdown
from .pageindex import md_to_tree, page_index_main
from .pageindex.utils import (
    ConfigLoader,
    create_node_mapping,
    extract_json,
    get_page_tokens,
    llm_acompletion,
)

# OCR render resolution. 200 DPI is the sweet spot for Tesseract on
# typical print-quality scans — accuracy plateaus above this and memory
# scales quadratically (a 300 DPI A4 pixmap ≈ 25 MB raw, vs 11 MB at 200).
_OCR_DPI = 200
_OCR_LANGS = "ind+eng"

# Extensions that go through the markdown engine. Office formats are first
# converted to Markdown by the helpers in converter.py; .md/.markdown go
# straight in. Everything outside this set + .pdf is rejected upstream.
_MARKDOWN_LIKE_EXTS = {".md", ".markdown", ".docx", ".pptx"}


class UnsupportedFormatError(Exception):
    """Raised when build_index is asked to index an unsupported file type."""


class ImageOnlyPdfError(Exception):
    """Raised when a PDF has no machine-readable text on any page.

    These documents need OCR before they can be indexed. The service
    surfaces the message to the UI so the user understands why their
    upload couldn't be processed."""


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

    def build_index(self, file_path: str | Path, doc_id: str | None = None) -> dict:
        """
        Build a hierarchical tree for the PDF at `file_path` and return:
            {"pi_doc_id": str, "tree": dict, "page_count": int}

        `pi_doc_id` is kept for schema compatibility with the previous
        hosted-API adapter — for the local engine it's just the application
        document id (or the file stem if none was provided).
        """
        file_path = Path(file_path)
        if not file_path.is_file():
            raise FileNotFoundError(f"File not found: {file_path}")

        ext = file_path.suffix.lower()
        logger.info(f"Building PageIndex tree locally for {file_path.name} (ext={ext})")
        opt = ConfigLoader().load(
            {k: v for k, v in {"model": self._indexing_model}.items() if v}
        )

        if ext == ".pdf":
            # `page_index_main` is synchronous and internally spins its own
            # event loop via asyncio.run. Running it inside an already-running
            # loop would deadlock, so callers from async contexts should
            # off-load via run_in_executor.
            try:
                result = page_index_main(str(file_path), opt)
            except Exception as e:
                # PageIndex raises "Processing failed" when its TOC verifier
                # decides the LLM-generated structure is too sparse (e.g.
                # last heading lands before the document midpoint). The PDF
                # is still useful for RAG — just without per-section
                # citations — so fall back to a per-page flat tree instead
                # of failing the upload entirely.
                logger.warning(
                    f"PageIndex tree generation failed for {file_path.name}: "
                    f"{e!r} — falling back to flat per-page structure"
                )
                result = self._build_flat_pdf_tree(file_path, opt)
        elif ext in _MARKDOWN_LIKE_EXTS:
            md_path = self._ensure_markdown(file_path, doc_id)
            # md_to_tree is async; we're running inside a worker thread
            # (caller off-loads via run_in_executor) so a fresh event loop
            # via asyncio.run is safe and matches the PDF path's pattern.
            result = asyncio.run(
                md_to_tree(
                    str(md_path),
                    if_add_node_summary="yes",
                    summary_token_threshold=200,
                    # Generate a doc-level description so the service layer
                    # has something to show when the user has many docs
                    # selected and we need to pick which one to retrieve
                    # from first (multi-doc routing). Costs one extra LLM
                    # call at index time, no cost at query time.
                    if_add_doc_description="yes",
                    model=self._indexing_model,
                )
            )
        else:
            raise UnsupportedFormatError(
                f"Unsupported document format: {ext}. "
                f"Supported: .pdf, .md, .markdown, .docx, .pptx"
            )

        tree: list[dict] | dict = (
            result.get("structure", []) if isinstance(result, dict) else result
        )

        # Normalise the tree shape we hand back to the service layer:
        #   structure: list of root nodes (each with `title`, `nodes`, `text`, ...)
        #   doc_name:  PDF / markdown filename
        # We also embed the application doc_id so the retrieval side can
        # report it back even after a process restart.
        wrapped = {
            "doc_id": doc_id or file_path.stem,
            "doc_name": (
                result.get("doc_name") if isinstance(result, dict) else file_path.name
            ),
            "doc_description": (
                result.get("doc_description") if isinstance(result, dict) else None
            ),
            "structure": tree if isinstance(tree, list) else [],
            # True when we couldn't build a real TOC and fell back to a
            # per-page flat tree. Persisted to the documents table for
            # diagnostics; not currently surfaced in the UI.
            "fallback_used": bool(
                isinstance(result, dict) and result.get("fallback_used")
            ),
        }

        page_count = _count_pages_from_tree(wrapped["structure"])

        return {
            "pi_doc_id": wrapped["doc_id"],
            "tree": wrapped,
            "page_count": page_count,
        }

    def _build_flat_pdf_tree(self, file_path: Path, opt: Any) -> dict:
        """Fallback when PageIndex's LLM-driven TOC generation fails.

        Reads each page via PyPDF2 and emits one tree node per page so
        the document is still retrievable end-to-end — just without the
        hierarchical section structure PageIndex normally produces.
        Citations land on page numbers, which is the minimum useful unit.

        Empty pages (no embedded text layer) are passed through Tesseract
        OCR before being skipped, so scanned/image-only PDFs still index
        successfully. Only raises ImageOnlyPdfError if *every* page is
        empty AND OCR couldn't recover any text either.
        """
        page_list = get_page_tokens(str(file_path), model=opt.model)
        total_pages = len(page_list)
        structure: list[dict] = []
        ocr_recovered_pages = 0

        # Open the PDF once for the OCR pass (only if we'll actually need
        # it — a fully text-native PDF skips the open entirely). Reusing
        # the same `pymupdf.Document` across pages avoids the per-page
        # xref-parse overhead that would otherwise dominate runtime for a
        # 100+ page scanned doc.
        needs_ocr = any(not (t or "").strip() for t, _ in page_list)
        ocr_doc: pymupdf.Document | None = None
        ocr_disabled = False  # flips True on first TesseractNotFoundError

        if needs_ocr:
            try:
                ocr_doc = pymupdf.open(str(file_path))
            except Exception as e:
                logger.warning(
                    f"OCR: failed to open {file_path.name} for rendering: {e!r}"
                )
                ocr_doc = None

        try:
            for idx, (page_text, _tokens) in enumerate(page_list, start=1):
                text = (page_text or "").strip()
                if not text and ocr_doc is not None and not ocr_disabled:
                    # No embedded text — try OCR before giving up. Lets us
                    # index scanned PDFs (receipts, photographed contracts,
                    # SplitBill_Master_Plan-style image-only exports).
                    text, ocr_disabled = self._ocr_pdf_page(
                        ocr_doc, idx, file_path.name
                    )
                    if text:
                        ocr_recovered_pages += 1
                if not text:
                    continue
                first_line = next(
                    (ln.strip() for ln in text.splitlines() if ln.strip()),
                    "",
                )
                title = first_line[:80] if first_line else f"Page {idx}"
                structure.append(
                    {
                        "title": title,
                        "node_id": f"page_{idx:04d}",
                        "start_index": idx,
                        "end_index": idx,
                        "text": text,
                        "summary": text[:200],
                        "nodes": [],
                    }
                )
        finally:
            if ocr_doc is not None:
                ocr_doc.close()

        if ocr_recovered_pages:
            logger.info(
                f"OCR recovered text from {ocr_recovered_pages}/{total_pages} "
                f"pages of {file_path.name}"
            )

        if not structure:
            raise ImageOnlyPdfError(
                f"No extractable text in any of {total_pages} pages, even "
                f"after OCR — the PDF may be blank, too low-resolution, or "
                f"contain only non-text imagery."
            )

        return {
            "doc_name": file_path.name,
            "doc_description": (
                "Document indexed in fallback mode — per-page only, "
                "no hierarchical structure available."
            ),
            "structure": structure,
            "fallback_used": True,
        }

    def _ocr_pdf_page(
        self,
        doc: pymupdf.Document,
        page_idx: int,
        doc_name: str,
    ) -> tuple[str, bool]:
        """Run Tesseract OCR on one page of an already-open PDF.

        Returns `(text, ocr_disabled)`. `ocr_disabled` flips True only
        when the Tesseract binary is missing — the caller uses it to
        short-circuit subsequent pages instead of re-logging the same
        error N times. Any other failure returns empty text with
        `ocr_disabled=False` so we try the next page.

        `page_idx` is 1-indexed to match the rest of the pipeline.
        """
        pix = None
        img = None
        try:
            page = doc[page_idx - 1]
            pix = page.get_pixmap(dpi=_OCR_DPI)
            img = Image.open(BytesIO(pix.tobytes("png")))
            text = pytesseract.image_to_string(img, lang=_OCR_LANGS)
            return (text or "").strip(), False
        except pytesseract.TesseractNotFoundError:
            # Disable for the rest of this document so we don't spam logs
            # once per empty page on a 100-page scan.
            logger.error(
                "tesseract binary not found on PATH; OCR fallback disabled "
                "for the remainder of this document. Install with "
                "`apt-get install tesseract-ocr` plus the language packs."
            )
            return "", True
        except Exception as e:
            logger.warning(f"OCR failed for page {page_idx} of {doc_name}: {e!r}")
            return "", False
        finally:
            # Release the pixmap eagerly — under concurrent uploads the GC
            # lag can let several hundred MB pile up between pages.
            if img is not None:
                img.close()
            del pix

    def _ensure_markdown(self, src: Path, doc_id: str | None) -> Path:
        """Return a path to a Markdown version of `src`.

        For .md / .markdown the source is used as-is. For .docx / .pptx
        we run the appropriate converter and cache the output under the
        workspace's `converted/` directory, keyed by doc_id so concurrent
        uploads of different files don't collide.
        """
        ext = src.suffix.lower()
        if ext in {".md", ".markdown"}:
            return src

        converted_dir = self._workspace / "converted"
        out_path = converted_dir / f"{doc_id or src.stem}.md"
        try:
            if ext == ".docx":
                return docx_to_markdown(src, out_path)
            if ext == ".pptx":
                return pptx_to_markdown(src, out_path)
        except ConversionError as e:
            # Re-raise with the same message but as the format error type
            # so the caller can present a user-readable failure status.
            raise UnsupportedFormatError(str(e)) from e

        raise UnsupportedFormatError(f"No markdown converter registered for {ext}")

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
    """Highest `end_index` (1-indexed page) seen across the tree, or 0.

    Returns 0 for markdown-derived trees (nodes only have `line_num`,
    not page indices). The UI hides the page count when it's falsy.
    """
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
    """Pick the most useful page citation for a node.

    PDF nodes carry `start_index` / `physical_index` / `end_index`
    (1-indexed page numbers). Markdown-derived nodes carry `line_num`
    instead — there's no real "page" to cite, so we return 0 to signal
    "no page citation" and let the UI decide how to render that.
    """
    for key in ("start_index", "physical_index", "end_index"):
        value = node.get(key)
        if isinstance(value, int) and value > 0:
            return value
    if isinstance(node.get("line_num"), int):
        # Markdown node — no meaningful page number exists.
        return 0
    # Fall back to walking into children for nodes with neither index
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
