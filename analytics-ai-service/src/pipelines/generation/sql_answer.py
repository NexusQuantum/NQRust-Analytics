import asyncio
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
from src.web.v1.services import Configuration

logger = logging.getLogger("analytics-service")

sql_to_answer_system_prompt = """
### ROLE ###
You are an expert data analyst who excels at translating complex SQL results into clear, actionable insights for non-technical users.

### TASK ###
Transform SQL query results into natural language answers that are easy to understand, engaging, and directly address the user's question.

### CORE PRINCIPLES ###
1. **User-Centric Communication**: Focus on what the data means for the user, not technical details
2. **Clear Value Delivery**: Highlight key insights, trends, and actionable information
3. **Appropriate Detail Level**: Provide sufficient context without overwhelming with technical jargon
4. **Language Consistency**: Match the user's specified language and communication style
5. **Visual Clarity**: Use proper Markdown formatting for readability
6. **Source Transparency**: ALWAYS attribute every claim to its source. The user must
   know WHERE each piece of information comes from.

### SOURCE ATTRIBUTION (MANDATORY) ###
Every factual claim in your answer must end with a clear source tag:

- **Database claim** — append the table name(s) you queried, formatted as
  `(sumber: tabel <name>)` in Indonesian, or `(source: <name> table)` in English.
  Use the table names visible in the SQL `FROM` and `JOIN` clauses (strip the
  `public_` prefix when presenting to the user).

  Example: "Plutzer Lebensmittelgroßmärkte AG memasok **5 produk**
  (sumber: tabel products, suppliers)."

- **Document claim** — append `[filename, hal. PAGE]` immediately after the
  sentence. This citation format is required even for partial document
  references.

  Example: "Mereka termasuk Action list dengan composite score 64
  [Supplier Quality Audit Q1 2026, hal. 3]."

- **Mixed claim** (both DB + doc) — both attributions, comma-separated.

- **Inferred / business interpretation** (not directly from a source) — prefix
  with "*Interpretasi:*" or "*Catatan:*" so the user knows it's reasoning, not data.

Never make a factual claim without attribution. If you don't know the source,
either omit the claim or label it as interpretation.

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly
- **Language Variable**: Use the specified language from the Language field above
- **Explicit Language**: The user has specified language as "{{ language }}" - respond in that language only

### RESPONSE GUIDELINES ###
- **Avoid Technical Terms**: Never mention SQL syntax, database concepts, or technical implementation details
- **Focus on Insights**: Emphasize what the data reveals, not how it was obtained
- **Use Natural Language**: Write as if explaining to a colleague, not a database
- **Highlight Key Findings**: Bold important numbers, trends, or conclusions
- **Provide Context**: Explain what the results mean in business terms
- **Handle Large Datasets**: Show top examples and mention if more results exist
- **Custom Instructions**: Strictly follow any user-provided style preferences

### FORMATTING STANDARDS ###
- Use **bold** for key numbers and important findings
- Use bullet points for lists and comparisons
- Use tables for structured data presentation
- Use headers (##) for major sections
- Never include code blocks or technical syntax

### OUTPUT FORMAT ###
Provide your response in clean Markdown format without ```markdown``` tags.
"""

sql_to_answer_user_prompt_template = """
### TASK ###
Transform the SQL query results into a clear, actionable answer that directly addresses the user's question using natural language and business context.

### ANALYTICAL CONTEXT ###
User's Question: {{ query }}
SQL Query: {{ sql }}
Query Results:
- Columns: {{ sql_data.columns }}
- Data: {{ sql_data.data }}
Language: {{ language }}
Current Time: {{ current_time }}

{% if document_context %}
### USER-ATTACHED DOCUMENT CONTEXT ###
The user has attached the following document excerpts as additional context.
**These often contain the answer the user is looking for** (e.g., targets,
policies, decisions) when the SQL query result is empty or unrelated.

{% for chunk in document_context %}
[{{ chunk.filename }}, hal. {{ chunk.page }}]
{{ chunk.text }}
---
{% endfor %}

### CRITICAL INSTRUCTIONS ###
1. If the SQL result is empty/null but the document excerpts contain the
   answer, USE THE DOCUMENT to answer. Do NOT say "no data available".
2. Cite document content inline using [filename, hal. PAGE].
3. If both SQL data and documents are relevant, integrate both.
4. Trust the document content as authoritative when the question is about
   targets, strategy, or policy.
{% endif %}

### SOURCE ATTRIBUTION REQUIRED ###
For EVERY factual statement in your answer, append the source. Use the table
names from the SQL above (strip `public_` prefix). Examples:

- DB-derived fact:
  "Plutzer memasok 5 produk (sumber: tabel products, suppliers)."
- Document-derived fact:
  "Audit menemukan 4 keterlambatan pengiriman [Supplier Quality Audit Q1 2026, hal. 3]."
- Both:
  "Plutzer memiliki 5 produk (sumber: tabel products, suppliers) dan masuk
  Action list audit [Supplier Quality Audit Q1 2026, hal. 3]."

This is non-negotiable: a claim without attribution is unacceptable.

### RESPONSE GUIDELINES ###
- **Direct Answer**: Start with a clear, direct answer to the user's question
- **Data Insights**: Highlight key findings, trends, and important numbers
- **Business Context**: Explain what the results mean for the business
- **Visual Clarity**: Use formatting to make the answer scannable and readable
- **Actionable Information**: Provide insights that help with decision-making
- **Custom Instructions**: Follow any user-provided style preferences

### FORMATTING REQUIREMENTS ###
- Use **bold** for key numbers and important findings
- Use bullet points for lists and comparisons
- Use tables for structured data presentation
- Use headers (##) for major sections
- Avoid technical jargon and SQL terminology

Custom Instruction: {{ custom_instruction }}

Please think step by step and provide a comprehensive answer.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    query: str,
    sql: str,
    sql_data: dict,
    language: str,
    current_time: str,
    custom_instruction: str,
    prompt_builder: PromptBuilder,
    document_context: list[dict] | None = None,
) -> dict:
    _prompt = prompt_builder.run(
        query=query,
        sql=sql,
        sql_data=sql_data,
        language=language,
        current_time=current_time,
        custom_instruction=custom_instruction,
        document_context=document_context,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_answer(
    prompt: dict, generator: Any, query_id: str, generator_name: str
) -> dict:
    return await generator(
        prompt=prompt.get("prompt"), query_id=query_id
    ), generator_name


## End of Pipeline


class SQLAnswer(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._user_queues = {}
        self._components = {
            "prompt_builder": PromptBuilder(
                template=sql_to_answer_user_prompt_template
            ),
            "generator": llm_provider.get_generator(
                system_prompt=sql_to_answer_system_prompt,
                streaming_callback=self._streaming_callback,
            ),
            "generator_name": llm_provider.get_model(),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    def _streaming_callback(self, chunk, query_id):
        if query_id not in self._user_queues:
            self._user_queues[
                query_id
            ] = asyncio.Queue()  # Create a new queue for the user if it doesn't exist
        # Put the chunk content into the user's queue
        asyncio.create_task(self._user_queues[query_id].put(chunk.content))
        if chunk.meta.get("finish_reason"):
            asyncio.create_task(self._user_queues[query_id].put("<DONE>"))

    async def get_streaming_results(self, query_id):
        async def _get_streaming_results(query_id):
            return await self._user_queues[query_id].get()

        if query_id not in self._user_queues:
            self._user_queues[
                query_id
            ] = asyncio.Queue()  # Ensure the user's queue exists
        while True:
            try:
                # Wait for an item from the user's queue
                self._streaming_results = await asyncio.wait_for(
                    _get_streaming_results(query_id), timeout=120
                )
                if (
                    self._streaming_results == "<DONE>"
                ):  # Check for end-of-stream signal
                    del self._user_queues[query_id]
                    break
                if self._streaming_results:  # Check if there are results to yield
                    yield self._streaming_results
                    self._streaming_results = ""  # Clear after yielding
            except TimeoutError:
                break

    @observe(name="SQL Answer Generation")
    async def _execute(
        self,
        query: str,
        sql: str,
        sql_data: dict,
        language: str,
        current_time: str = Configuration().show_current_time(),
        query_id: Optional[str] = None,
        custom_instruction: Optional[str] = None,
        document_context: Optional[list[dict]] = None,
    ) -> dict:
        logger.info("Sql_Answer Generation pipeline is running...")
        return await self._pipe.execute(
            ["generate_answer"],
            inputs={
                "query": query,
                "sql": sql,
                "sql_data": sql_data,
                "language": language,
                "current_time": current_time,
                "query_id": query_id,
                "custom_instruction": custom_instruction or "",
                "document_context": document_context,
                **self._components,
            },
        )

    async def run(
        self,
        query: str,
        sql: str,
        sql_data: dict,
        language: str,
        current_time: str = Configuration().show_current_time(),
        query_id: Optional[str] = None,
        custom_instruction: Optional[str] = None,
        document_context: Optional[list[dict]] = None,
    ) -> dict:
        return await self._execute(
            query=query,
            sql=sql,
            sql_data=sql_data,
            language=language,
            current_time=current_time,
            query_id=query_id,
            custom_instruction=custom_instruction,
            document_context=document_context,
        )



