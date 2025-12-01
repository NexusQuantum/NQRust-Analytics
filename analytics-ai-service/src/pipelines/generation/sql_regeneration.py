import logging
import sys
from typing import Any

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.engine import Engine
from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.pipelines.generation.utils.sql import (
    SQL_GENERATION_MODEL_KWARGS,
    TEXT_TO_SQL_RULES,
    SQLGenPostProcessor,
    calculated_field_instructions,
    construct_instructions,
    json_field_instructions,
    metric_instructions,
)
from src.pipelines.retrieval.sql_functions import SqlFunction
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


sql_regeneration_system_prompt = f"""
### ROLE ###
You are an expert SQL developer who specializes in regenerating SQL queries based on detailed reasoning plans and database schema analysis.

### TASK ###
Review provided reasoning plans and regenerate SQL queries that accurately implement the analytical logic while leveraging the database schema effectively.

### REGENERATION PRINCIPLES ###
1. **Reasoning Alignment**: Ensure the new query perfectly matches the provided reasoning plan
2. **Schema Optimization**: Leverage the database schema to create efficient, accurate queries
3. **Reference Integration**: Use the original SQL query as a reference for structure and approach
4. **Logic Preservation**: Maintain the analytical intent while improving implementation
5. **Best Practices**: Apply SQL best practices for performance and maintainability

### ANALYSIS FRAMEWORK ###
- **Reasoning Review**: Carefully analyze each step of the provided reasoning plan
- **Schema Mapping**: Connect reasoning elements to appropriate database tables and columns
- **Query Structure**: Design the optimal query structure based on the reasoning flow
- **Reference Learning**: Extract useful patterns and approaches from the original query
- **Logic Validation**: Ensure the regenerated query will produce the intended analytical results

### REGENERATION STRATEGY ###
- **Step-by-Step Implementation**: Follow the reasoning plan systematically
- **Schema Utilization**: Use the most appropriate tables and columns for each analytical step
- **Performance Optimization**: Consider query efficiency while maintaining accuracy
- **Error Prevention**: Avoid common SQL pitfalls and syntax issues
- **Result Verification**: Ensure the query will produce meaningful, accurate results

### QUALITY STANDARDS ###
- **Accuracy**: The query must precisely implement the reasoning plan
- **Efficiency**: Optimize for performance while maintaining correctness
- **Readability**: Write clear, maintainable SQL code
- **Completeness**: Address all aspects of the reasoning plan
- **Robustness**: Handle edge cases and potential data variations

{TEXT_TO_SQL_RULES}

### OUTPUT FORMAT ###
```json
{{
    "sql": "<regenerated_sql_query_string>"
}}
```
"""

sql_regeneration_user_prompt_template = """
### TASK ###
Review the provided reasoning plan and regenerate a SQL query that accurately implements the analytical logic while leveraging the database schema effectively.

### DATABASE SCHEMA ###
{% for document in documents %}
    {{ document }}
{% endfor %}

{% if calculated_field_instructions %}
{{ calculated_field_instructions }}
{% endif %}

{% if metric_instructions %}
{{ metric_instructions }}
{% endif %}

{% if json_field_instructions %}
{{ json_field_instructions }}
{% endif %}

{% if sql_functions %}
### SQL FUNCTIONS ###
{% for function in sql_functions %}
{{ function }}
{% endfor %}
{% endif %}

{% if sql_samples %}
### SQL SAMPLES ###
{% for sample in sql_samples %}
Question:
{{sample.question}}
SQL:
{{sample.sql}}
{% endfor %}
{% endif %}

{% if instructions %}
### USER INSTRUCTIONS ###
{% for instruction in instructions %}
{{ loop.index }}. {{ instruction }}
{% endfor %}
{% endif %}

### REGENERATION CONTEXT ###
SQL generation reasoning: {{ sql_generation_reasoning }}
Original SQL query: {{ sql }}

### REGENERATION GUIDELINES ###
- **Reasoning Alignment**: Ensure the new query perfectly matches the provided reasoning plan
- **Schema Optimization**: Leverage the database schema to create efficient, accurate queries
- **Reference Integration**: Use the original SQL query as a reference for structure and approach
- **Logic Preservation**: Maintain the analytical intent while improving implementation
- **Best Practices**: Apply SQL best practices for performance and maintainability

### ANALYSIS FRAMEWORK ###
- **Reasoning Review**: Carefully analyze each step of the provided reasoning plan
- **Schema Mapping**: Connect reasoning elements to appropriate database tables and columns
- **Query Structure**: Design the optimal query structure based on the reasoning flow
- **Reference Learning**: Extract useful patterns and approaches from the original query
- **Logic Validation**: Ensure the regenerated query will produce the intended analytical results

### QUALITY STANDARDS ###
- **Accuracy**: The query must precisely implement the reasoning plan
- **Efficiency**: Optimize for performance while maintaining correctness
- **Readability**: Write clear, maintainable SQL code
- **Completeness**: Address all aspects of the reasoning plan
- **Robustness**: Handle edge cases and potential data variations

Let's think step by step and provide the regenerated SQL query.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    documents: list[str],
    sql_generation_reasoning: str,
    sql: str,
    prompt_builder: PromptBuilder,
    sql_samples: list[dict] | None = None,
    instructions: list[dict] | None = None,
    has_calculated_field: bool = False,
    has_metric: bool = False,
    has_json_field: bool = False,
    sql_functions: list[SqlFunction] | None = None,
) -> dict:
    _prompt = prompt_builder.run(
        sql=sql,
        documents=documents,
        sql_generation_reasoning=sql_generation_reasoning,
        instructions=construct_instructions(
            instructions=instructions,
        ),
        calculated_field_instructions=(
            calculated_field_instructions if has_calculated_field else ""
        ),
        metric_instructions=(metric_instructions if has_metric else ""),
        json_field_instructions=(json_field_instructions if has_json_field else ""),
        sql_samples=sql_samples,
        sql_functions=sql_functions,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def regenerate_sql(
    prompt: dict,
    generator: Any,
    generator_name: str,
) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
async def post_process(
    regenerate_sql: dict,
    post_processor: SQLGenPostProcessor,
    project_id: str | None = None,
) -> dict:
    return await post_processor.run(
        regenerate_sql.get("replies"),
        project_id=project_id,
    )


## End of Pipeline


class SQLRegeneration(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        engine: Engine,
        **kwargs,
    ):
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=sql_regeneration_system_prompt,
                generation_kwargs=SQL_GENERATION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=sql_regeneration_user_prompt_template
            ),
            "post_processor": SQLGenPostProcessor(engine=engine),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="SQL Regeneration")
    async def _execute(
        self,
        contexts: list[str],
        sql_generation_reasoning: str,
        sql: str,
        sql_samples: list[dict] | None = None,
        instructions: list[dict] | None = None,
        project_id: str | None = None,
        has_calculated_field: bool = False,
        has_metric: bool = False,
        has_json_field: bool = False,
        sql_functions: list[SqlFunction] | None = None,
    ):
        logger.info("SQL Regeneration pipeline is running...")
        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "documents": contexts,
                "sql_generation_reasoning": sql_generation_reasoning,
                "sql": sql,
                "sql_samples": sql_samples,
                "instructions": instructions,
                "project_id": project_id,
                "has_calculated_field": has_calculated_field,
                "has_metric": has_metric,
                "has_json_field": has_json_field,
                "sql_functions": sql_functions,
                **self._components,
            },
        )

    async def run(
        self,
        contexts: list[str],
        sql_generation_reasoning: str,
        sql: str,
        sql_samples: list[dict] | None = None,
        instructions: list[dict] | None = None,
        project_id: str | None = None,
        has_calculated_field: bool = False,
        has_metric: bool = False,
        has_json_field: bool = False,
        sql_functions: list[SqlFunction] | None = None,
    ):
        return await self._execute(
            contexts=contexts,
            sql_generation_reasoning=sql_generation_reasoning,
            sql=sql,
            sql_samples=sql_samples,
            instructions=instructions,
            project_id=project_id,
            has_calculated_field=has_calculated_field,
            has_metric=has_metric,
            has_json_field=has_json_field,
            sql_functions=sql_functions,
        )



