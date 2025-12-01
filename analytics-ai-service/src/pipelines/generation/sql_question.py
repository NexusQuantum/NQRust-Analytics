import logging
import sys
from typing import Any

import orjson
from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.utils import trace_cost
from src.web.v1.services import Configuration

logger = logging.getLogger("analytics-service")


sql_question_system_prompt = """
### ROLE ###
You are an expert data analyst who specializes in translating SQL queries into clear, natural language questions that any user can understand.

### TASK ###
Convert SQL queries into single, concise questions that capture the intent and purpose of the query in plain language.

### TRANSLATION PRINCIPLES ###
1. **Natural Language Focus**: Write questions as a human would ask them
2. **Business Context**: Frame questions in terms of business value and insights
3. **Clarity Over Technicality**: Avoid SQL terminology and database jargon
4. **Single Sentence**: Keep questions concise and to the point
5. **Language Consistency**: Use the exact language specified by the user

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly

### QUESTION STRUCTURE ###
- Start with question words: "What", "How many", "Which", "Who", "When", "Where"
- Focus on the business outcome, not the technical process
- Include relevant context (time periods, categories, filters)
- Make it actionable and specific

### EXAMPLES ###
SQL: `SELECT COUNT(*) FROM orders WHERE status = 'completed'`
Question: "How many completed orders are there?"

SQL: `SELECT AVG(price) FROM products WHERE category = 'electronics'`
Question: "What is the average price of electronics?"

SQL: `SELECT customer_name, total_spent FROM customers ORDER BY total_spent DESC LIMIT 10`
Question: "Who are the top 10 customers by total spending?"

### OUTPUT FORMAT ###
```json
{
    "question": "<natural language question in user's language>"
}
```
"""

sql_question_user_prompt_template = """
### TASK ###
Convert the provided SQL query into a clear, natural language question that captures the intent and purpose of the query in plain language.

### SQL QUERY ###
SQL: {{sql}}
Language: {{language}}

### TRANSLATION GUIDELINES ###
- **Natural Language Focus**: Write questions as a human would ask them
- **Business Context**: Frame questions in terms of business value and insights
- **Clarity Over Technicality**: Avoid SQL terminology and database jargon
- **Single Sentence**: Keep questions concise and to the point
- **Language Consistency**: Use the exact language specified by the user

### QUESTION STRUCTURE ###
- Start with question words: "What", "How many", "Which", "Who", "When", "Where"
- Focus on the business outcome, not the technical process
- Include relevant context (time periods, categories, filters)
- Make it actionable and specific

### EXAMPLES ###
SQL: `SELECT COUNT(*) FROM orders WHERE status = 'completed'`
Question: "How many completed orders are there?"

SQL: `SELECT AVG(price) FROM products WHERE category = 'electronics'`
Question: "What is the average price of electronics?"

SQL: `SELECT customer_name, total_spent FROM customers ORDER BY total_spent DESC LIMIT 10`
Question: "Who are the top 10 customers by total spending?"

Let's think step by step and provide the natural language question.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    sql: str,
    language: str,
    prompt_builder: PromptBuilder,
) -> dict:
    _prompt = prompt_builder.run(
        sql=sql,
        language=language,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_sql_question(
    prompt: dict, generator: Any, generator_name: str
) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def post_process(
    generate_sql_question: dict,
) -> str:
    return orjson.loads(generate_sql_question.get("replies")[0])["question"]


## End of Pipeline


class SQLQuestionResult(BaseModel):
    question: str


SQL_QUESTION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "sql_question_result",
            "schema": SQLQuestionResult.model_json_schema(),
        },
    }
}


class SQLQuestion(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=sql_question_system_prompt,
                generation_kwargs=SQL_QUESTION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(template=sql_question_user_prompt_template),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Sql Question Generation")
    async def _execute(
        self,
        sql: str,
        configuration: Configuration | dict = Configuration(),
    ):
        # Handle configuration as dict or Configuration object
        if isinstance(configuration, dict):
            configuration = Configuration(**configuration)

        logger.info("Sql Question Generation pipeline is running...")
        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "sql": sql,
                "language": configuration.language or "English",
                **self._components,
            },
        )

    async def run(
        self,
        sql: str,
        configuration: Configuration | dict = Configuration(),
    ):
        return await self._execute(sql=sql, configuration=configuration)



