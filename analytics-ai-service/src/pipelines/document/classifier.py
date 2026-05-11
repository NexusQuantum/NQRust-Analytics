import logging
import sys
from typing import Any, Literal, Optional

import orjson
from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.utils import add_additional_properties_false, trace_cost

logger = logging.getLogger("analytics-service")

QueryRoute = Literal["sql_only", "doc_only", "hybrid_doc_first", "hybrid_parallel"]


doc_classifier_system_prompt = """
### ROLE ###
You are an intelligent query router for an analytics platform that can answer questions using:
1. SQL database data (structured data, metrics, transactions, records)
2. Document knowledge base (PDFs, reports, documentation, unstructured text)

### TASK ###
Classify the user's question into the appropriate routing strategy.

### ROUTING STRATEGIES ###
- **sql_only**: Question is purely about data/metrics/records answerable from the database
- **doc_only**: Question is purely about concepts, policies, or information in documents
- **hybrid_doc_first**: Question needs document context FIRST to understand what SQL to generate (e.g., "what is the definition of revenue churn?")
- **hybrid_parallel**: Question needs both data AND document context simultaneously (e.g., "compare our Q3 sales against the targets in the strategy doc")

### OUTPUT FORMAT ###
```json
{
    "route": "sql_only|doc_only|hybrid_doc_first|hybrid_parallel",
    "reasoning": "<brief explanation>"
}
```
"""

doc_classifier_user_prompt_template = """
### USER QUESTION ###
{{ query }}

{% if has_documents %}
### AVAILABLE DOCUMENTS ###
The user has selected {{ document_count }} document(s) as context sources.
{% else %}
### NO DOCUMENTS SELECTED ###
The user has not selected any documents. Route to sql_only or GENERAL.
{% endif %}

{% if histories %}
### CONVERSATION HISTORY ###
{% for h in histories %}
Q: {{ h.question }}
{% endfor %}
{% endif %}

Classify the routing strategy for this question.
"""


## Start of Pipeline

@observe(capture_input=False)
def build_classifier_prompt(
    query: str,
    has_documents: bool,
    document_count: int,
    histories: list,
    prompt_builder: PromptBuilder,
) -> dict:
    _prompt = prompt_builder.run(
        query=query,
        has_documents=has_documents,
        document_count=document_count,
        histories=histories,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def classify_route(
    build_classifier_prompt: dict,
    generator: Any,
    generator_name: str,
) -> dict:
    return await generator(prompt=build_classifier_prompt.get("prompt")), generator_name


@observe(capture_input=False)
def post_process_route(classify_route: dict, has_documents: bool) -> dict:
    try:
        result = orjson.loads(classify_route.get("replies")[0])
        route = result.get("route", "sql_only")
        if route not in ("sql_only", "doc_only", "hybrid_doc_first", "hybrid_parallel"):
            route = "sql_only"
        if not has_documents and route != "sql_only":
            route = "sql_only"
        return {"route": route, "reasoning": result.get("reasoning", "")}
    except Exception:
        return {"route": "sql_only", "reasoning": ""}


## End of Pipeline


class ClassifierResult(BaseModel):
    route: Literal["sql_only", "doc_only", "hybrid_doc_first", "hybrid_parallel"]
    reasoning: str


CLASSIFIER_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "doc_classifier",
            "schema": add_additional_properties_false(ClassifierResult.model_json_schema()),
        },
    }
}


class DocumentClassifier(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(
                template=doc_classifier_user_prompt_template
            ),
            "generator": llm_provider.get_generator(
                system_prompt=doc_classifier_system_prompt,
                generation_kwargs=CLASSIFIER_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Document Route Classification")
    async def _execute(
        self,
        query: str,
        document_ids: list[str],
        histories: Optional[list] = None,
    ) -> dict:
        has_documents = bool(document_ids)
        logger.info(f"Classifying route for query (has_docs={has_documents})")

        return await self._pipe.execute(
            ["post_process_route"],
            inputs={
                "query": query,
                "has_documents": has_documents,
                "document_count": len(document_ids),
                "histories": histories or [],
                **self._components,
            },
        )

    async def run(
        self,
        query: str,
        document_ids: list[str],
        histories: Optional[list] = None,
    ) -> dict:
        return await self._execute(
            query=query,
            document_ids=document_ids,
            histories=histories,
        )
