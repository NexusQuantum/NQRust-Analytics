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

logger = logging.getLogger("analytics-service")


user_guide_assistance_system_prompt = """
### ROLE ###
You are an expert Analytics AI support specialist who helps users understand system capabilities, features, and best practices using comprehensive user guide documentation.

### TASK ###
Provide accurate, helpful answers about Analytics AI functionality by referencing the provided user guide documentation and citing relevant sources.

### SUPPORT PRINCIPLES ###
1. **Documentation-Driven**: Base all answers on the provided user guide content
2. **Accuracy First**: Only provide information that's explicitly covered in the guide
3. **Clear Citations**: Always reference the specific document URLs for your information
4. **User-Centric Language**: Explain features in terms of user benefits and use cases
5. **Honest Limitations**: Acknowledge when information isn't available in the guide

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly

### RESPONSE GUIDELINES ###
- **Language Consistency**: Use the user's specified language throughout
- **Rich Formatting**: Use proper Markdown formatting for readability
- **Citation Requirements**: Include document URLs for all referenced information
- **Custom Instructions**: Strictly follow any user-provided style preferences
- **Scope Boundaries**: Only answer questions covered in the user guide

### CONTENT STRUCTURE ###
- Start with a direct answer to the user's question
- Provide step-by-step guidance when explaining processes
- Include relevant examples or use cases from the guide
- Highlight important limitations or prerequisites
- Suggest related features or next steps when appropriate

### LIMITATION HANDLING ###
- If the question isn't covered in the guide, politely explain this limitation
- Suggest contacting support or checking other documentation sources
- Offer to help with related questions that are covered in the guide
- Maintain a helpful tone even when unable to provide a complete answer

### OUTPUT FORMAT ###
Provide your response in clean Markdown format without ```markdown``` tags.
"""

user_guide_assistance_user_prompt_template = """
### TASK ###
Provide accurate, helpful answers about Analytics AI functionality by referencing the provided user guide documentation and citing relevant sources.

### USER CONTEXT ###
User Question: {{query}}
Language: {{language}}
Custom Instruction: {{ custom_instruction }}

### USER GUIDE DOCUMENTATION ###
{% for doc in docs %}
- {{doc.path}}: {{doc.content}}
{% endfor %}

### RESPONSE GUIDELINES ###
- **Documentation-Driven**: Base all answers on the provided user guide content
- **Accuracy First**: Only provide information that's explicitly covered in the guide
- **Clear Citations**: Always reference the specific document URLs for your information
- **User-Centric Language**: Explain features in terms of user benefits and use cases
- **Honest Limitations**: Acknowledge when information isn't available in the guide

### CONTENT STRUCTURE ###
- **Direct Answer**: Start with a clear, direct answer to the user's question
- **Step-by-Step Guidance**: Provide detailed instructions when explaining processes
- **Relevant Examples**: Include use cases and examples from the guide
- **Important Notes**: Highlight limitations, prerequisites, or important considerations
- **Related Features**: Suggest related functionality or next steps when appropriate

### LIMITATION HANDLING ###
- If the question isn't covered in the guide, politely explain this limitation
- Suggest contacting support or checking other documentation sources
- Offer to help with related questions that are covered in the guide
- Maintain a helpful tone even when unable to provide a complete answer

Please think step by step and provide comprehensive support.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    query: str,
    language: str,
    analytics_docs: list[dict],
    prompt_builder: PromptBuilder,
    custom_instruction: str,
) -> dict:
    _prompt = prompt_builder.run(
        query=query,
        language=language,
        docs=analytics_docs,
        custom_instruction=custom_instruction,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def user_guide_assistance(
    prompt: dict, generator: Any, query_id: str, generator_name: str
) -> dict:
    return await generator(
        prompt=prompt.get("prompt"), query_id=query_id
    ), generator_name


## End of Pipeline


class UserGuideAssistance(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        analytics_docs: list[dict],
        **kwargs,
    ):
        self._user_queues = {}
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=user_guide_assistance_system_prompt,
                streaming_callback=self._streaming_callback,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=user_guide_assistance_user_prompt_template
            ),
        }
        self._configs = {
            "analytics_docs": analytics_docs,
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
            self._user_queues[query_id] = asyncio.Queue()

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

    @observe(name="User Guide Assistance")
    async def _execute(
        self,
        query: str,
        language: str,
        query_id: Optional[str] = None,
        custom_instruction: Optional[str] = None,
    ):
        logger.info("User Guide Assistance pipeline is running...")
        return await self._pipe.execute(
            ["user_guide_assistance"],
            inputs={
                "query": query,
                "language": language,
                "query_id": query_id or "",
                "custom_instruction": custom_instruction or "",
                **self._components,
                **self._configs,
            },
        )

    async def run(
        self,
        query: str,
        language: str,
        query_id: Optional[str] = None,
        custom_instruction: Optional[str] = None,
    ):
        return await self._execute(
            query=query,
            language=language,
            query_id=query_id,
            custom_instruction=custom_instruction,
        )



