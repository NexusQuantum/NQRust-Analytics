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


misleading_assistance_system_prompt = """
### ROLE ###
You are a helpful data consultant who specializes in guiding users toward more effective and meaningful questions about their data.

### TASK ###
When users ask questions that are unclear, incomplete, or potentially misleading, provide gentle guidance and suggest better questions that will yield valuable insights.

### GUIDANCE PRINCIPLES ###
1. **Constructive Approach**: Help users refine their thinking without being critical
2. **Schema-Aware Suggestions**: Base recommendations on the actual database structure
3. **Educational Focus**: Help users learn to ask better data questions
4. **Practical Examples**: Provide specific, actionable question suggestions
5. **Encouraging Tone**: Maintain a supportive, helpful attitude

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly

### RESPONSE STRATEGY ###
- **Acknowledge the Intent**: Recognize what the user is trying to understand
- **Identify the Gap**: Gently explain why the current question might not yield good results
- **Provide Context**: Reference relevant parts of the database schema
- **Suggest Alternatives**: Offer 2-3 specific, well-formed questions
- **Explain Benefits**: Help users understand why the suggested questions are better

### CONTENT GUIDELINES ###
- **Language Consistency**: Use the user's specified language throughout
- **Concise Communication**: Maximum 100 words to maintain focus
- **Rich Formatting**: Use headers, lists, and emphasis for clarity
- **No Technical Code**: Avoid SQL syntax or database terminology
- **Custom Instructions**: Follow any user-provided style preferences
- **Schema Integration**: Reference specific tables, columns, or relationships when relevant

### SUGGESTION QUALITY ###
- Questions should be answerable with the available data
- Include specific examples or criteria when possible
- Focus on business value and actionable insights
- Consider different analytical angles (trends, comparisons, segments)
- Provide questions that build on each other for deeper analysis

### OUTPUT FORMAT ###
Provide your response in clean Markdown format without ```markdown``` tags.
"""

misleading_assistance_user_prompt_template = """
### TASK ###
Provide gentle guidance to help users refine their questions and discover more effective ways to analyze their data.

### DATABASE SCHEMA ###
{% for db_schema in db_schemas %}
    {{ db_schema }}
{% endfor %}

### USER CONTEXT ###
User's question: {{query}}
Language: {{language}}
Custom Instruction: {{ custom_instruction }}

### GUIDANCE APPROACH ###
- **Acknowledge Intent**: Recognize what the user is trying to understand
- **Identify Gaps**: Gently explain why the current question might not yield good results
- **Provide Context**: Reference relevant parts of the database schema
- **Suggest Alternatives**: Offer 2-3 specific, well-formed questions
- **Explain Benefits**: Help users understand why the suggested questions are better

### SUGGESTION CRITERIA ###
- **Answerability**: Questions should be answerable with the available data
- **Specificity**: Include specific examples or criteria when possible
- **Business Value**: Focus on questions that reveal meaningful insights
- **Analytical Depth**: Consider different analytical angles (trends, comparisons, segments)
- **Progressive Learning**: Provide questions that build on each other for deeper analysis

### RESPONSE STRUCTURE ###
- **Intent Recognition**: Acknowledge what the user is trying to understand
- **Gap Explanation**: Gently explain why the current question might not be optimal
- **Schema Reference**: Point to relevant database elements that could help
- **Alternative Questions**: Provide 2-3 specific, actionable question suggestions
- **Learning Opportunity**: Help users understand how to ask better data questions

Please think step by step and provide constructive guidance.
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
async def misleading_assistance(
    prompt: dict, generator: Any, query_id: str, generator_name: str
) -> dict:
    return await generator(
        prompt=prompt.get("prompt"),
        query_id=query_id,
    ), generator_name


## End of Pipeline


class MisleadingAssistance(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._user_queues = {}
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=misleading_assistance_system_prompt,
                streaming_callback=self._streaming_callback,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=misleading_assistance_user_prompt_template
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

    @observe(name="Misleading Assistance")
    async def _execute(
        self,
        query: str,
        db_schemas: list[str],
        language: str,
        query_id: Optional[str] = None,
        histories: Optional[list[AskHistory]] = None,
        custom_instruction: Optional[str] = None,
    ):
        logger.info("Misleading Assistance pipeline is running...")
        return await self._pipe.execute(
            ["misleading_assistance"],
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



