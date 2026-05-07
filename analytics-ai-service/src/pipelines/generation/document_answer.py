"""Document-only Q&A — answer using just attached document context.

Skips the SQL pipeline entirely. Used when the user asks a question that
only needs information from uploaded documents (NotebookLM-style).

Flow: query + selected_document_ids -> retrieve top-K chunks -> LLM compose
answer with [filename, hal. PAGE] citations.
"""
from __future__ import annotations

import asyncio
import logging
import sys
from typing import Any, List, Optional

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.pipelines.retrieval.documents import DocumentsRetrieval
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


document_answer_system_prompt = """
### ROLE ###
You are a precise document-grounded assistant. Answer the user's question
using the provided document excerpts. Be helpful and surface ALL relevant
information, even if you can't fully answer the question.

### ANSWER STRATEGY ###
- **Full match** — question fully answerable from docs → answer fully with citations.
- **Partial match** — docs contain SOME relevant info but not all → answer
  with what you found AND clearly say which part is missing. Do NOT just
  say "tidak ditemukan" if there is partial relevant info.
- **No match at all** — nothing relevant in docs → say so plainly.

Example of partial-match handling:
  Q: "How many products does Plutzer supply, and why are they on the action list?"
  Bad:  "Tidak ditemukan dalam dokumen."
  Good: "Plutzer ada di Action list karena 4 late deliveries dan cold-chain
  failures [audit.pdf, hal. 3]. Namun, jumlah produk yang mereka supply tidak
  disebut di dokumen — informasi itu kemungkinan ada di database supplier."

### CITATION RULES (MANDATORY) ###
- Cite EVERY factual claim with the format [filename, hal. PAGE].
- Citation must come **immediately after** the sentence/clause it supports —
  not at the end of the paragraph.
- Multiple citations are fine if a sentence draws from multiple chunks.
- For interpretation/inference (not direct quote), prefix with
  "*Interpretasi:*" or "*Catatan:*" so the user knows it's reasoning.

### LANGUAGE ###
Respond in the same language as the user's question.
Keep responses focused, ideally under ~200 words.

### OUTPUT FORMAT ###
Plain Markdown. No code fences around the entire response.
"""


document_answer_user_prompt_template = """
### USER QUESTION ###
{{ query }}

### DOCUMENT EXCERPTS ###
{% for chunk in chunks %}
[{{ chunk.filename }}, hal. {{ chunk.page }}]
{{ chunk.text }}
---
{% endfor %}

### INSTRUCTIONS ###
Answer using the excerpts above. Cite with [filename, hal. PAGE].

If the question has multiple parts and the excerpts only answer SOME:
  - Answer the parts you CAN, with citations.
  - For parts you CAN'T, briefly note what's missing — e.g.,
    "namun jumlah X tidak disebutkan di dokumen ini, kemungkinan tersedia
    di database."

Only say "Informasi tidak ditemukan dalam dokumen yang dipilih." (or the
equivalent in the user's language) when NONE of the question can be
answered from the excerpts.
"""


# --- Hamilton DAG nodes -------------------------------------------------


@observe(capture_input=False)
async def retrieved_chunks(
    query: str,
    selected_document_ids: List[str],
    project_id: str,
    documents_retrieval: DocumentsRetrieval,
) -> List[dict]:
    if not selected_document_ids:
        return []
    result = await documents_retrieval.run(
        query=query,
        selected_document_ids=selected_document_ids,
        project_id=project_id,
    )
    return result.get("formatted_output", {}).get("documents", []) or []


@observe(capture_input=False)
def prompt(
    query: str,
    retrieved_chunks: List[dict],
    prompt_builder: PromptBuilder,
) -> dict:
    _prompt = prompt_builder.run(query=query, chunks=retrieved_chunks)
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_answer(
    prompt: dict,
    retrieved_chunks: List[dict],
    generator: Any,
    generator_name: str,
    query_id: str = "",
) -> dict:
    if not retrieved_chunks:
        # No chunks retrieved — short-circuit instead of calling the LLM.
        return {
            "replies": [
                "Informasi tidak ditemukan dalam dokumen yang dipilih."
            ],
            "meta": [{"finish_reason": "no_chunks"}],
        }, generator_name
    return await generator(
        prompt=prompt.get("prompt"),
        query_id=query_id,
    ), generator_name


# --- Pipeline class -----------------------------------------------------


class DocumentAnswer(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        documents_retrieval: DocumentsRetrieval,
        **kwargs,
    ):
        self._user_queues: dict = {}
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=document_answer_system_prompt,
                streaming_callback=self._streaming_callback,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=document_answer_user_prompt_template
            ),
            "documents_retrieval": documents_retrieval,
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    def _streaming_callback(self, chunk, query_id):
        if not query_id:
            return
        if query_id not in self._user_queues:
            self._user_queues[query_id] = asyncio.Queue()
        asyncio.create_task(self._user_queues[query_id].put(chunk.content))
        if chunk.meta.get("finish_reason"):
            asyncio.create_task(self._user_queues[query_id].put("<DONE>"))

    def _enqueue_synthetic_message(self, query_id: str, message: str) -> None:
        """Push a non-LLM message (e.g. 'no chunks found') through the queue
        so frontend streaming consumers see it the same way as a real reply."""
        if not query_id:
            return
        if query_id not in self._user_queues:
            self._user_queues[query_id] = asyncio.Queue()
        asyncio.create_task(self._user_queues[query_id].put(message))
        asyncio.create_task(self._user_queues[query_id].put("<DONE>"))

    async def get_streaming_results(self, query_id):
        async def _get(query_id):
            return await self._user_queues[query_id].get()

        if query_id not in self._user_queues:
            self._user_queues[query_id] = asyncio.Queue()
        while True:
            try:
                result = await asyncio.wait_for(_get(query_id), timeout=120)
                if result == "<DONE>":
                    del self._user_queues[query_id]
                    break
                if result:
                    yield result
            except TimeoutError:
                break

    @observe(name="Document Answer")
    async def _execute(
        self,
        query: str,
        selected_document_ids: List[str],
        project_id: Optional[str] = None,
        query_id: Optional[str] = None,
    ) -> dict:
        logger.info(
            f"[doc-answer] Running for project={project_id} docs={selected_document_ids}"
        )
        result = await self._pipe.execute(
            ["generate_answer"],
            inputs={
                "query": query,
                "selected_document_ids": selected_document_ids,
                "project_id": project_id or "",
                "query_id": query_id or "",
                **self._components,
            },
        )

        # If short-circuited (no chunks), the streaming queue never received
        # anything from the LLM — push the synthetic message ourselves so the
        # frontend's poll loop terminates gracefully.
        gen = result.get("generate_answer", {})
        if isinstance(gen, tuple):
            gen = gen[0]
        finish = (gen.get("meta") or [{}])[0].get("finish_reason")
        if finish == "no_chunks" and query_id:
            self._enqueue_synthetic_message(
                query_id, gen.get("replies", [""])[0]
            )
        return result

    async def run(
        self,
        query: str,
        selected_document_ids: List[str],
        project_id: Optional[str] = None,
        query_id: Optional[str] = None,
    ) -> dict:
        return await self._execute(
            query=query,
            selected_document_ids=selected_document_ids,
            project_id=project_id,
            query_id=query_id,
        )
