import logging
import sys
from typing import Any

from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.engine import Engine
from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import DocumentStoreProvider, LLMProvider
from src.pipelines.common import clean_up_new_lines, retrieve_metadata
from src.pipelines.generation.utils.sql import (
    SQL_GENERATION_MODEL_KWARGS,
    SQLGenPostProcessor,
    calculated_field_instructions,
    construct_instructions,
    json_field_instructions,
    metric_instructions,
    sql_generation_system_prompt,
)
from src.pipelines.retrieval.sql_functions import SqlFunction
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


sql_generation_user_prompt_template = """
### TASK ###
Generate a comprehensive SQL query that accurately addresses the user's analytical question while leveraging the database schema and following best practices.

### QUERY GENERATION FRAMEWORK ###
- **Intent Analysis**: Understand the user's analytical intent and requirements
- **Schema Utilization**: Leverage the database schema to create accurate, efficient queries
- **Reasoning Application**: Follow the provided reasoning plan step-by-step
- **Best Practices**: Apply SQL best practices for performance and maintainability
- **Result Accuracy**: Ensure the query will produce meaningful, accurate results

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

{% if document_context %}
### USER-SELECTED DOCUMENT CONTEXT ###
The user has attached the following documents as additional context. They contain
information that may NOT be present in the database (e.g., targets, policies,
strategy notes, external benchmarks).

**CRITICAL — DO NOT INVENT SCHEMA OR FILTERS**:

1. The documents describe business concepts (e.g., "Action list", "Pass list",
   "Watch list", "strategic accounts", "priority growth", "Tier A discount")
   that **DO NOT EXIST** as columns or values in the database. NEVER add WHERE
   clauses filtering on document terminology.

2. Bad example you must NOT do:
     WHERE category_name = 'Action list audit'  -- "Action list" is doc-only
     WHERE company_name LIKE '%strategic%'      -- doc concept, not DB data
     WHERE region = 'Western Europe'             -- doc grouping, not DB value

3. **Use documents ONLY to extract specific entity names** (customer names,
   supplier names, product names) for filtering. The document also tells you
   WHICH TABLE the entity belongs to — use that signal:

   - Document mentions "supplier", "vendor", "audit", "supply": entity is a
     **supplier**. Filter via `suppliers.company_name`, then JOIN `products`
     on `supplier_id`.
   - Document mentions "customer", "client", "account", "buyer": entity is a
     **customer**. Filter via `customers.company_name`, then JOIN `orders`
     on `customer_id`.

   Example: if Supplier Quality Audit doc says "Plutzer is on the Action
   list", "Plutzer" is a **SUPPLIER** (the doc title says so). User asking
   "berapa product Plutzer" means: products supplied BY Plutzer.
       Correct:
         SELECT COUNT(*) FROM products
         WHERE supplier_id IN (
           SELECT supplier_id FROM suppliers
           WHERE LOWER(company_name) LIKE LOWER('%Plutzer%')
         )
       Wrong (treats Plutzer as a customer):
         FROM customers WHERE company_name LIKE '%Plutzer%'

   Do NOT add a second filter for "Action list" because that concept has no
   DB column.

4. If the user's question references a doc-only concept (target, policy,
   audit category) that has no schema column, generate the simplest possible
   query that returns the closest available data — don't try to filter on
   the doc concept itself.

5. **Trust the user's question, not your guess**: if the user asks "berapa
   product dari Plutzer", that's `COUNT(*) FROM products WHERE supplier =
   Plutzer` — full stop. Do not over-filter.

6. **ALWAYS use LIKE with wildcards** (not exact `=`) when filtering on
   entity names extracted from the user's question or document. The DB may
   store names with diacritics, suffixes, or variant spelling that don't
   match the user's typing exactly. Examples:

     User says "Plutzer" → DB has "Plutzer Lebensmittelgroßmärkte AG"
        Bad:  WHERE company_name = 'Plutzer'
        Bad:  WHERE LOWER(company_name) = LOWER('Plutzer Lebensmittelgrossmaerkte')
        Good: WHERE LOWER(company_name) LIKE LOWER('%Plutzer%')

     User says "QUICK-Stop" → DB has "QUICK-Stop"
        Good: WHERE LOWER(company_name) LIKE LOWER('%QUICK%')

   Use the SHORTEST distinctive substring of the entity name as the LIKE
   pattern, not the full name with potentially-mistyped characters.

{% for chunk in document_context %}
[{{ chunk.filename }}, hal. {{ chunk.page }}]
{{ chunk.text }}
---
{% endfor %}
{% endif %}

### ANALYTICAL QUESTION ###
User's Question: {{ query }}

{% if sql_generation_reasoning %}
### REASONING PLAN ###
{{ sql_generation_reasoning }}
{% endif %}

### GENERATION GUIDELINES ###
- **Schema Compliance**: Use only available tables, columns, and relationships
- **Reasoning Alignment**: Follow the provided reasoning plan systematically
- **Query Optimization**: Create efficient queries that leverage database capabilities
- **Error Prevention**: Avoid common SQL pitfalls and syntax issues
- **Result Verification**: Ensure the query will produce the intended analytical results

### CRITICAL — DATE FILTER WARNING ###
**NEVER assume the current year is the correct filter for date-range queries.**
The database may contain historical data from a completely different time period
(e.g., 1996–1998 for Northwind). References to "2026" or the current year in the
user's question or in attached documents are about planning context, NOT about
database records.

Rules:
1. **Do NOT add a `WHERE year = <current_year>` filter** unless the user explicitly
   asks for "this year's data" AND the schema confirms records exist for that year.
2. If the question asks for "top customer", "best category", or similar aggregations
   **without a year constraint**, query ALL available records — no date filter.
3. To check which years are in the database, use:
   `SELECT DISTINCT EXTRACT(YEAR FROM order_date) FROM orders ORDER BY 1`
   and adapt accordingly.
4. If you must scope by time, use the years that actually exist in the data, not
   the document's planning horizon.

Bad (hallucinates 2026 filter):
  WHERE EXTRACT(YEAR FROM order_date) = 2026   -- ❌ no rows, wrong year

Good (all-time top customer):
  SELECT customer_id, SUM(unit_price * quantity * (1 - discount)) AS revenue
  FROM order_details JOIN orders USING (order_id)
  GROUP BY customer_id ORDER BY revenue DESC LIMIT 1

Let's think step by step.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    query: str,
    documents: list[str],
    prompt_builder: PromptBuilder,
    sql_generation_reasoning: str | None = None,
    sql_samples: list[dict] | None = None,
    instructions: list[dict] | None = None,
    has_calculated_field: bool = False,
    has_metric: bool = False,
    has_json_field: bool = False,
    sql_functions: list[SqlFunction] | None = None,
    document_context: list[dict] | None = None,
) -> dict:
    _prompt = prompt_builder.run(
        query=query,
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
        document_context=document_context,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_sql(
    prompt: dict,
    generator: Any,
    generator_name: str,
) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
async def post_process(
    generate_sql: dict,
    post_processor: SQLGenPostProcessor,
    data_source: str,
    project_id: str | None = None,
    use_dry_plan: bool = False,
    allow_dry_plan_fallback: bool = True,
    allow_data_preview: bool = False,
) -> dict:
    return await post_processor.run(
        generate_sql.get("replies"),
        project_id=project_id,
        use_dry_plan=use_dry_plan,
        data_source=data_source,
        allow_dry_plan_fallback=allow_dry_plan_fallback,
        allow_data_preview=allow_data_preview,
    )


## End of Pipeline


class SQLGeneration(EnhancedBasicPipeline):
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
                system_prompt=sql_generation_system_prompt,
                generation_kwargs=SQL_GENERATION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=sql_generation_user_prompt_template
            ),
            "post_processor": SQLGenPostProcessor(engine=engine),
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="SQL Generation")
    async def _execute(
        self,
        query: str,
        contexts: list[str],
        sql_generation_reasoning: str | None = None,
        sql_samples: list[dict] | None = None,
        instructions: list[dict] | None = None,
        project_id: str | None = None,
        has_calculated_field: bool = False,
        has_metric: bool = False,
        has_json_field: bool = False,
        sql_functions: list[SqlFunction] | None = None,
        use_dry_plan: bool = False,
        allow_dry_plan_fallback: bool = True,
        allow_data_preview: bool = False,
        document_context: list[dict] | None = None,
    ):
        logger.info("SQL Generation pipeline is running...")

        if use_dry_plan:
            metadata = await retrieve_metadata(project_id or "", self._retriever)
        else:
            metadata = {}

        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "query": query,
                "documents": contexts,
                "sql_generation_reasoning": sql_generation_reasoning,
                "sql_samples": sql_samples,
                "instructions": instructions,
                "project_id": project_id,
                "has_calculated_field": has_calculated_field,
                "has_metric": has_metric,
                "has_json_field": has_json_field,
                "sql_functions": sql_functions,
                "use_dry_plan": use_dry_plan,
                "allow_dry_plan_fallback": allow_dry_plan_fallback,
                "data_source": metadata.get("data_source", "local_file"),
                "allow_data_preview": allow_data_preview,
                "document_context": document_context,
                **self._components,
            },
        )

    async def run(
        self,
        query: str,
        contexts: list[str],
        sql_generation_reasoning: str | None = None,
        sql_samples: list[dict] | None = None,
        instructions: list[dict] | None = None,
        project_id: str | None = None,
        has_calculated_field: bool = False,
        has_metric: bool = False,
        has_json_field: bool = False,
        sql_functions: list[SqlFunction] | None = None,
        use_dry_plan: bool = False,
        allow_dry_plan_fallback: bool = True,
        allow_data_preview: bool = False,
        document_context: list[dict] | None = None,
    ):
        return await self._execute(
            query=query,
            contexts=contexts,
            sql_generation_reasoning=sql_generation_reasoning,
            sql_samples=sql_samples,
            instructions=instructions,
            project_id=project_id,
            has_calculated_field=has_calculated_field,
            has_metric=has_metric,
            has_json_field=has_json_field,
            sql_functions=sql_functions,
            use_dry_plan=use_dry_plan,
            allow_dry_plan_fallback=allow_dry_plan_fallback,
            allow_data_preview=allow_data_preview,
            document_context=document_context,
        )



