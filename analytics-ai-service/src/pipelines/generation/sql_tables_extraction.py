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

logger = logging.getLogger("analytics-service")


sql_tables_extraction_system_prompt = """
### ROLE ###
You are an expert SQL parser who specializes in accurately identifying and extracting table references from SQL queries of any complexity.

### TASK ###
Analyze SQL queries and extract all table names that are referenced, including those in JOINs, subqueries, CTEs, and other SQL constructs.

### EXTRACTION PRINCIPLES ###
1. **Comprehensive Coverage**: Identify tables from all SQL constructs (SELECT, FROM, JOIN, subqueries, CTEs, etc.)
2. **Accurate Parsing**: Handle complex SQL syntax including aliases, nested queries, and multiple JOINs
3. **Deduplication**: Remove duplicate table references while preserving the complete list
4. **Case Sensitivity**: Maintain original case of table names as they appear in the query
5. **Syntax Awareness**: Recognize different SQL dialects and syntax variations

### EXTRACTION SCOPE ###
- **Direct References**: Tables in FROM clauses and JOIN statements
- **Subquery Tables**: Tables referenced within subqueries and CTEs
- **Aliased Tables**: Tables with aliases (extract the actual table name, not the alias)
- **Cross References**: Tables in WHERE clauses, HAVING clauses, and other contexts
- **Nested Queries**: Tables in deeply nested subqueries and derived tables

### HANDLING COMPLEX CASES ###
- **Table Aliases**: Extract the original table name, not the alias
- **Schema Prefixes**: Include schema-qualified table names (schema.table)
- **Dynamic SQL**: Handle table references in dynamic SQL constructs
- **Views and CTEs**: Include view names and CTE names as table references
- **Function Results**: Consider table-valued functions as table sources

### EXAMPLES ###
```sql
-- Simple query
SELECT * FROM users
Output: {"tables": ["users"]}

-- Multiple tables with JOIN
SELECT u.name, o.total FROM users u JOIN orders o ON u.id = o.user_id
Output: {"tables": ["users", "orders"]}

-- Complex query with subqueries
SELECT * FROM (SELECT * FROM products WHERE category = 'electronics') p
JOIN categories c ON p.category_id = c.id
Output: {"tables": ["products", "categories"]}

-- CTE example
WITH monthly_sales AS (SELECT * FROM sales WHERE date >= '2024-01-01')
SELECT * FROM monthly_sales ms JOIN customers c ON ms.customer_id = c.id
Output: {"tables": ["sales", "customers"]}
```

### OUTPUT FORMAT ###
```json
{
  "tables": ["<table1>", "<table2>", "<table3>"]
}
```
"""

sql_tables_extraction_user_prompt_template = """
### TASK ###
Analyze the provided SQL query and extract all table names that are referenced, including those in JOINs, subqueries, CTEs, and other SQL constructs.

### SQL QUERY ###
SQL: {{sql}}

### EXTRACTION GUIDELINES ###
- **Comprehensive Coverage**: Identify tables from all SQL constructs (SELECT, FROM, JOIN, subqueries, CTEs, etc.)
- **Accurate Parsing**: Handle complex SQL syntax including aliases, nested queries, and multiple JOINs
- **Deduplication**: Remove duplicate table references while preserving the complete list
- **Case Sensitivity**: Maintain original case of table names as they appear in the query
- **Syntax Awareness**: Recognize different SQL dialects and syntax variations

### EXTRACTION SCOPE ###
- **Direct References**: Tables in FROM clauses and JOIN statements
- **Subquery Tables**: Tables referenced within subqueries and CTEs
- **Aliased Tables**: Tables with aliases (extract the actual table name, not the alias)
- **Cross References**: Tables in WHERE clauses, HAVING clauses, and other contexts
- **Nested Queries**: Tables in deeply nested subqueries and derived tables

### HANDLING COMPLEX CASES ###
- **Table Aliases**: Extract the original table name, not the alias
- **Schema Prefixes**: Include schema-qualified table names (schema.table)
- **Dynamic SQL**: Handle table references in dynamic SQL constructs
- **Views and CTEs**: Include view names and CTE names as table references
- **Function Results**: Consider table-valued functions as table sources

Let's think step by step and extract all table references.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    sql: str,
    prompt_builder: PromptBuilder,
) -> dict:
    _prompt = prompt_builder.run(sql=sql)
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def extract_sql_tables(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
async def post_process(
    extract_sql_tables: dict,
) -> list[str]:
    return orjson.loads(extract_sql_tables.get("replies")[0])["tables"]


## End of Pipeline


class SQLTablesExtractionResult(BaseModel):
    tables: list[str]


SQL_TABLES_EXTRACTION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "sql_tables_extraction_result",
            "schema": SQLTablesExtractionResult.model_json_schema(),
        },
    }
}


class SQLTablesExtraction(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "generator": llm_provider.get_generator(
                system_prompt=sql_tables_extraction_system_prompt,
                generation_kwargs=SQL_TABLES_EXTRACTION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=sql_tables_extraction_user_prompt_template
            ),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Sql Tables Extraction")
    async def _execute(
        self,
        sql: str,
    ):
        logger.info("Sql Tables Extraction pipeline is running...")
        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "sql": sql,
                **self._components,
            },
        )

    async def run(
        self,
        sql: str,
    ):
        return await self._execute(sql=sql)



