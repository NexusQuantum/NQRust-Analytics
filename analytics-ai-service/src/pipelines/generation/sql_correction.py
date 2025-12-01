import logging
import sys
from typing import Any, Dict, List

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack import Document
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.engine import Engine
from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import DocumentStoreProvider, LLMProvider
from src.pipelines.common import clean_up_new_lines, retrieve_metadata
from src.pipelines.generation.utils.sql import (
    SQL_GENERATION_MODEL_KWARGS,
    TEXT_TO_SQL_RULES,
    SQLGenPostProcessor,
    construct_instructions,
)
from src.pipelines.retrieval.sql_functions import SqlFunction
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


sql_correction_system_prompt = f"""
### ROLE ###
You are an expert SQL developer and database architect who specializes in debugging and correcting SQL syntax errors while preserving the original query's intent and semantics.

### TASK ###
Analyze syntactically incorrect SQL queries and their error messages to generate corrected, valid SQL that maintains the original query's purpose and data retrieval logic.

### CORRECTION PRINCIPLES ###
1. **Semantic Preservation**: Maintain the original query's intent and data selection logic
2. **Syntax Compliance**: Ensure the corrected query follows proper ANSI SQL syntax
3. **Error Resolution**: Address the specific syntax errors identified in the error message
4. **Best Practices**: Apply SQL best practices while fixing the immediate issues
5. **Minimal Changes**: Make only necessary corrections without over-engineering

### DEBUGGING APPROACH ###
- **Error Analysis**: Carefully analyze the error message to understand the specific syntax issue
- **Query Structure**: Examine the overall query structure for logical flow and completeness
- **Syntax Validation**: Ensure all SQL keywords, operators, and clauses are properly formatted
- **Schema Compliance**: Verify that table and column references are correct
- **Logic Verification**: Confirm that the corrected query will produce the intended results

### COMMON CORRECTION AREAS ###
- **Missing Keywords**: Add missing SELECT, FROM, WHERE, or other required keywords
- **Syntax Errors**: Fix incorrect operator usage, missing parentheses, or malformed clauses
- **Join Issues**: Correct JOIN syntax, ON clauses, and table relationships
- **Aggregation Problems**: Fix GROUP BY, HAVING, and aggregate function usage
- **Subquery Syntax**: Correct nested query structure and referencing
- **Data Type Issues**: Address type mismatches and casting problems

### QUALITY ASSURANCE ###
- **Syntax Validation**: Ensure the corrected query is syntactically valid
- **Logic Verification**: Confirm the query logic matches the original intent
- **Performance Consideration**: Maintain or improve query efficiency where possible
- **Readability**: Ensure the corrected query is clear and maintainable
- **Standards Compliance**: Follow ANSI SQL standards and best practices

{TEXT_TO_SQL_RULES}

### OUTPUT FORMAT ###
```json
{{
    "sql": "<corrected_sql_query_string>"
}}
```
"""

sql_correction_user_prompt_template = """
### TASK ###
Analyze the provided SQL query and error message to generate a corrected, valid SQL query that maintains the original query's intent and data retrieval logic.

### CONTEXT INFORMATION ###
{% if documents %}
### DATABASE SCHEMA ###
{% for document in documents %}
    {{ document }}
{% endfor %}
{% endif %}

{% if instructions %}
### USER INSTRUCTIONS ###
{% for instruction in instructions %}
{{ loop.index }}. {{ instruction }}
{% endfor %}
{% endif %}

### SQL CORRECTION CONTEXT ###
SQL: {{ invalid_generation_result.sql }}
Error Message: {{ invalid_generation_result.error }}

### CORRECTION GUIDELINES ###
- **Error Analysis**: Carefully analyze the error message to understand the specific syntax issue
- **Query Structure**: Examine the overall query structure for logical flow and completeness
- **Syntax Validation**: Ensure all SQL keywords, operators, and clauses are properly formatted
- **Schema Compliance**: Verify that table and column references are correct
- **Logic Verification**: Confirm that the corrected query will produce the intended results

### COMMON CORRECTION AREAS ###
- **Missing Keywords**: Add missing SELECT, FROM, WHERE, or other required keywords
- **Syntax Errors**: Fix incorrect operator usage, missing parentheses, or malformed clauses
- **Join Issues**: Correct JOIN syntax, ON clauses, and table relationships
- **Aggregation Problems**: Fix GROUP BY, HAVING, and aggregate function usage
- **Subquery Syntax**: Correct nested query structure and referencing
- **Data Type Issues**: Address type mismatches and casting problems

### QUALITY ASSURANCE ###
- **Syntax Validation**: Ensure the corrected query is syntactically valid
- **Logic Verification**: Confirm the query logic matches the original intent
- **Performance Consideration**: Maintain or improve query efficiency where possible
- **Readability**: Ensure the corrected query is clear and maintainable
- **Standards Compliance**: Follow ANSI SQL standards and best practices

Let's think step by step and provide the corrected SQL query.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    documents: List[Document],
    invalid_generation_result: Dict,
    prompt_builder: PromptBuilder,
    instructions: list[dict] | None = None,
    sql_functions: list[SqlFunction] | None = None,
) -> dict:
    _prompt = prompt_builder.run(
        documents=documents,
        invalid_generation_result=invalid_generation_result,
        instructions=construct_instructions(
            instructions=instructions,
        ),
        sql_functions=sql_functions,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_sql_correction(
    prompt: dict, generator: Any, generator_name: str
) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
async def post_process(
    generate_sql_correction: dict,
    post_processor: SQLGenPostProcessor,
    data_source: str,
    project_id: str | None = None,
    use_dry_plan: bool = False,
    allow_dry_plan_fallback: bool = True,
) -> dict:
    return await post_processor.run(
        generate_sql_correction.get("replies"),
        project_id=project_id,
        use_dry_plan=use_dry_plan,
        data_source=data_source,
        allow_dry_plan_fallback=allow_dry_plan_fallback,
    )


## End of Pipeline


class SQLCorrection(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        document_store_provider: DocumentStoreProvider,
        engine: Engine,
        **kwargs,
    ):
        self._retriever = document_store_provider.get_retriever(
            document_store_provider.get_store("project_meta")
        )

        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=sql_correction_system_prompt,
                generation_kwargs=SQL_GENERATION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=sql_correction_user_prompt_template
            ),
            "post_processor": SQLGenPostProcessor(engine=engine),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="SQL Correction")
    async def _execute(
        self,
        contexts: List[Document],
        invalid_generation_result: Dict[str, str],
        instructions: list[dict] | None = None,
        sql_functions: list[SqlFunction] | None = None,
        project_id: str | None = None,
        use_dry_plan: bool = False,
        allow_dry_plan_fallback: bool = True,
    ):
        logger.info("SQLCorrection pipeline is running...")

        if use_dry_plan:
            metadata = await retrieve_metadata(project_id or "", self._retriever)
        else:
            metadata = {}

        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "invalid_generation_result": invalid_generation_result,
                "documents": contexts,
                "instructions": instructions,
                "sql_functions": sql_functions,
                "project_id": project_id,
                "use_dry_plan": use_dry_plan,
                "allow_dry_plan_fallback": allow_dry_plan_fallback,
                "data_source": metadata.get("data_source", "local_file"),
                **self._components,
            },
        )

    async def run(
        self,
        contexts: List[Document],
        invalid_generation_result: Dict[str, str],
        instructions: list[dict] | None = None,
        sql_functions: list[SqlFunction] | None = None,
        project_id: str | None = None,
        use_dry_plan: bool = False,
        allow_dry_plan_fallback: bool = True,
    ):
        return await self._execute(
            contexts=contexts,
            invalid_generation_result=invalid_generation_result,
            instructions=instructions,
            sql_functions=sql_functions,
            project_id=project_id,
            use_dry_plan=use_dry_plan,
            allow_dry_plan_fallback=allow_dry_plan_fallback,
        )



