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
from src.web.v1.services.ask import AskHistory

logger = logging.getLogger("analytics-service")


data_assistance_system_prompt = """
### ROLE ###
You are an expert data analyst and database consultant who helps users understand their data structure, capabilities, and analytical possibilities.

### TASK ###
Provide clear, actionable guidance about database schemas, data relationships, and analytical opportunities using accessible language and practical examples.

### COMMUNICATION PRINCIPLES ###
1. **Clarity Over Complexity**: Explain database concepts in business terms, not technical jargon
2. **Practical Focus**: Emphasize what users can do with their data, not just what it contains
3. **Structured Information**: Use clear formatting to make information scannable and digestible
4. **Actionable Insights**: Provide specific guidance on how to leverage the data effectively
5. **Context Awareness**: Consider the user's question history and apparent analytical goals

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly

### RESPONSE GUIDELINES ###
- **Language Consistency**: Match the user's specified language and communication style
- **Appropriate Length**: 150 words max for CJK languages, 110 words for others
- **Rich Formatting**: Use headers, lists, tables, and emphasis for better readability
- **No Technical Code**: Avoid SQL syntax, database terminology, or implementation details
- **Custom Instructions**: Strictly follow any user-provided style preferences
- **Business Value**: Focus on insights and opportunities, not technical specifications

### CONTENT STRUCTURE ###
- Start with a direct answer to the user's question
- Provide relevant context about the data structure
- Highlight key relationships or analytical opportunities
- Suggest practical next steps or related questions
- Use examples when helpful for clarification

### OUTPUT FORMAT ###
Provide your response in clean Markdown format without ```markdown``` tags.
"""

data_assistance_user_prompt_template = """
### TASK ###
Provide clear, actionable guidance about the database schema and analytical capabilities to help users understand their data and make better analytical decisions.

### DATABASE SCHEMA ###
{% for db_schema in db_schemas %}
    {{ db_schema }}
{% endfor %}

### USER CONTEXT ###
User's question: {{query}}
Language: {{language}}
Custom Instruction: {{ custom_instruction }}

### RESPONSE GUIDELINES ###
- **Direct Answer**: Start with a clear, direct answer to the user's question
- **Schema Context**: Reference relevant tables, columns, and relationships
- **Analytical Opportunities**: Highlight what the user can analyze with their data
- **Practical Guidance**: Provide actionable advice for data exploration
- **Business Value**: Focus on insights and opportunities, not technical specifications
- **Custom Instructions**: Follow any user-provided style preferences

### CONTENT STRUCTURE ###
- **Question Response**: Address the user's specific question directly
- **Schema Insights**: Explain relevant database structure and capabilities
- **Analytical Suggestions**: Recommend specific questions or analyses they could perform
- **Next Steps**: Suggest practical next steps for data exploration
- **Examples**: Provide concrete examples when helpful for clarification

Please think step by step and provide comprehensive guidance.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    query: str,
    db_schemas: list[str],
    language: str,
    histories: list[AskHistory],
    prompt_builder: PromptBuilder,
    custom_instruction: str,
) -> dict:
    previous_query_summaries = (
        [history.question for history in histories] if histories else []
    )
    query = "\n".join(previous_query_summaries) + "\n" + query

    _prompt = prompt_builder.run(
        query=query,
        db_schemas=db_schemas,
        language=language,
        custom_instruction=custom_instruction,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def data_assistance(
    prompt: dict, generator: Any, query_id: str, generator_name: str
) -> dict:
    return await generator(
        prompt=prompt.get("prompt"),
        query_id=query_id,
    ), generator_name


## End of Pipeline


class DataAssistance(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._user_queues = {}
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=data_assistance_system_prompt,
                streaming_callback=self._streaming_callback,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=data_assistance_user_prompt_template
            ),
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

    @observe(name="Data Assistance")
    async def _execute(
        self,
        query: str,
        db_schemas: list[str],
        language: str,
        query_id: Optional[str] = None,
        histories: Optional[list[AskHistory]] = None,
        custom_instruction: Optional[str] = None,
    ):
        logger.info("Data Assistance pipeline is running...")
        return await self._pipe.execute(
            ["data_assistance"],
            inputs={
                "query": query,
                "db_schemas": db_schemas,
                "language": language,
                "query_id": query_id or "",
                "histories": histories or [],
                "custom_instruction": custom_instruction or "",
                **self._components,
            },
        )

    async def run(
        self,
        query: str,
        db_schemas: list[str],
        language: str,
        query_id: Optional[str] = None,
        histories: Optional[list[AskHistory]] = None,
        custom_instruction: Optional[str] = None,
    ):
        return await self._execute(
            query=query,
            db_schemas=db_schemas,
            language=language,
            query_id=query_id,
            histories=histories,
            custom_instruction=custom_instruction,
        )





