import logging
import sys
from typing import Any, Optional

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


document_answer_system_prompt = """
### ROLE ###
You are an expert research analyst who synthesizes information from documents to answer questions clearly and accurately.

### TASK ###
Answer the user's question based ONLY on the provided document passages. If the passages don't contain sufficient information, say so explicitly rather than guessing.

### CITATION REQUIREMENTS ###
- Every claim must be backed by a citation in format: [Page N, Section Name]
- If multiple passages support a claim, cite all of them
- Do not include information not present in the passages

### RESPONSE FORMAT ###
- Use clear Markdown formatting
- Bold key findings
- Include citations inline: "The revenue grew by **23%** [Page 5, Financial Summary]"
- At the end, include a "## Sources" section listing all cited pages

### LANGUAGE REQUIREMENTS ###
- Respond in the same language as the user's question
"""

document_answer_user_prompt_template = """
### QUESTION ###
{{ query }}

### DOCUMENT PASSAGES ###
{% for passage in passages %}
--- Passage {{ loop.index }} ---
Document: {{ passage.document_id }}
Page: {{ passage.page_number }}
Section: {{ passage.section_title }}
Content:
{{ passage.excerpt }}

{% endfor %}

Language: {{ language }}

### INSTRUCTIONS ###
Answer the question based on the passages above. Include page citations for every claim.
If the passages don't have enough information to answer, say: "The documents don't contain sufficient information to answer this question."
"""


## Start of Pipeline

@observe(capture_input=False)
def build_prompt(
    query: str,
    passages: list[dict],
    language: str,
    prompt_builder: PromptBuilder,
) -> dict:
    _prompt = prompt_builder.run(
        query=query,
        passages=passages,
        language=language,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_document_answer(
    build_prompt: dict,
    generator: Any,
    generator_name: str,
) -> dict:
    return await generator(prompt=build_prompt.get("prompt")), generator_name


## End of Pipeline


class DocumentAnswer(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(
                template=document_answer_user_prompt_template
            ),
            "generator": llm_provider.get_generator(
                system_prompt=document_answer_system_prompt,
            ),
            "generator_name": llm_provider.get_model(),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Document Answer Generation")
    async def _execute(
        self,
        query: str,
        passages: list[dict],
        language: str = "en",
    ) -> dict:
        logger.info("Document Answer Generation pipeline running...")
        return await self._pipe.execute(
            ["generate_document_answer"],
            inputs={
                "query": query,
                "passages": passages,
                "language": language,
                **self._components,
            },
        )

    async def run(
        self,
        query: str,
        passages: list[dict],
        language: str = "en",
    ) -> dict:
        return await self._execute(query=query, passages=passages, language=language)
