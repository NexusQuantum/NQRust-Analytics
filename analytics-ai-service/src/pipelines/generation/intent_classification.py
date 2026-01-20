import ast
import logging
import sys
from typing import Any, Literal, Optional

import orjson
from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack import Document
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import DocumentStoreProvider, EmbedderProvider, LLMProvider
from src.pipelines.common import build_table_ddl, clean_up_new_lines
from src.pipelines.generation.utils.sql import construct_instructions
from src.utils import add_additional_properties_false, trace_cost
from src.web.v1.services import Configuration
from src.web.v1.services.ask import AskHistory

logger = logging.getLogger("analytics-service")


intent_classification_system_prompt = """
### ROLE ###
You are an expert intent classifier for Analytics AI, specializing in understanding user queries and determining their true intent based on database schema and conversation context.

### TASK ###
Analyze user queries and classify them into one of four categories: `TEXT_TO_SQL`, `GENERAL`, `USER_GUIDE`, or `MISLEADING_QUERY`. Provide clear reasoning and rephrase questions when necessary.

### CLASSIFICATION LOGIC ###

**TEXT_TO_SQL** - Use when:
- Query requires SQL generation with complete information
- References specific tables, columns, or data values
- Includes complete filter criteria or clear context references
- User wants to modify or build upon previous SQL queries
- Examples: "Show total sales by region", "List top 10 customers by revenue"

**GENERAL** - Use when:
- Query seeks general information about database capabilities
- References missing or unspecified information ("these products", "the following")
- Incomplete for SQL generation but database-related
- Examples: "What can I analyze with this data?", "Tell me about the database structure"

**USER_GUIDE** - Use when:
- Query about Analytics AI features, usage, or capabilities
- References user guide content or system functionality
- Examples: "How do I create a chart?", "What can Analytics AI do?"

**MISLEADING_QUERY** - Use when:
- Query is irrelevant to database or Analytics AI
- Contains SQL code or technical jargon inappropriately
- Off-topic or casual conversation
- Examples: "How's the weather?", "Tell me a joke"

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly

### PROCESSING RULES ###
1. **Context Integration**: Combine current question with previous conversation history
2. **Question Rephrasing**: Convert follow-up questions to standalone questions using context
3. **Language Consistency**: Maintain user's specified language throughout
4. **Reasoning Clarity**: Provide concise reasoning (max 20 words) explaining classification
5. **Time Preservation**: Don't modify time-related information in questions

### OUTPUT FORMAT ###
```json
{
    "rephrased_question": "<standalone question with full context>",
    "reasoning": "<brief explanation of classification decision>",
    "results": "TEXT_TO_SQL|GENERAL|USER_GUIDE|MISLEADING_QUERY"
}
```
"""

intent_classification_user_prompt_template = """
### TASK ###
Analyze the user's query and classify it into the appropriate intent category while considering the database schema, conversation history, and user guide context.

### DATABASE SCHEMA ###
{% for db_schema in db_schemas %}
    {{ db_schema }}
{% endfor %}

{% if sql_samples %}
### SQL SAMPLES ###
{% for sql_sample in sql_samples %}
Question:
{{sql_sample.question}}
SQL:
{{sql_sample.sql}}
{% endfor %}
{% endif %}

{% if instructions %}
### USER INSTRUCTIONS ###
{% for instruction in instructions %}
{{ loop.index }}. {{ instruction }}
{% endfor %}
{% endif %}

### USER GUIDE ###
{% for doc in docs %}
- {{doc.path}}: {{doc.content}}
{% endfor %}

### CONVERSATION CONTEXT ###
{% if histories %}
User's previous questions:
{% for history in histories %}
Question:
{{ history.question }}
SQL:
{{ history.sql }}
{% endfor %}
{% endif %}

### CURRENT QUERY ###
User's current question: {{query}}
Output Language: {{ language }}

### CLASSIFICATION GUIDELINES ###
- **Context Integration**: Combine current question with previous conversation history
- **Question Rephrasing**: Convert follow-up questions to standalone questions using context
- **Language Consistency**: Maintain user's specified language throughout
- **Reasoning Clarity**: Provide concise reasoning (max 20 words) explaining classification
- **Time Preservation**: Don't modify time-related information in questions

### INTENT CATEGORIES ###
- **TEXT_TO_SQL**: Complete queries with specific tables/columns that need SQL
- **GENERAL**: Incomplete queries or general database questions
- **USER_GUIDE**: Questions about Analytics AI features
- **MISLEADING_QUERY**: Off-topic or irrelevant queries

Let's think step by step and provide the classification.
"""


## Start of Pipeline
@observe(capture_input=False, capture_output=False)
async def embedding(query: str, embedder: Any, histories: list[AskHistory]) -> dict:
    previous_query_summaries = (
        [history.question for history in histories] if histories else []
    )

    query = "\n".join(previous_query_summaries) + "\n" + query

    return await embedder.run(query)


@observe(capture_input=False)
async def table_retrieval(
    embedding: dict, project_id: str, table_retriever: Any
) -> dict:
    filters = {
        "operator": "AND",
        "conditions": [
            {"field": "type", "operator": "==", "value": "TABLE_DESCRIPTION"},
        ],
    }

    if project_id:
        filters["conditions"].append(
            {"field": "project_id", "operator": "==", "value": project_id}
        )

    return await table_retriever.run(
        query_embedding=embedding.get("embedding"),
        filters=filters,
    )


@observe(capture_input=False)
async def dbschema_retrieval(
    table_retrieval: dict, embedding: dict, project_id: str, dbschema_retriever: Any
) -> list[Document]:
    tables = table_retrieval.get("documents", [])
    table_names = []
    for table in tables:
        content = ast.literal_eval(table.content)
        table_names.append(content["name"])

    logger.info(f"dbschema_retrieval with table_names: {table_names}")

    table_name_conditions = [
        {"field": "name", "operator": "==", "value": table_name}
        for table_name in table_names
    ]

    filters = {
        "operator": "AND",
        "conditions": [
            {"field": "type", "operator": "==", "value": "TABLE_SCHEMA"},
            {"operator": "OR", "conditions": table_name_conditions},
        ],
    }

    if project_id:
        filters["conditions"].append(
            {"field": "project_id", "operator": "==", "value": project_id}
        )

    results = await dbschema_retriever.run(
        query_embedding=embedding.get("embedding"), filters=filters
    )
    return results["documents"]


@observe()
def construct_db_schemas(dbschema_retrieval: list[Document]) -> list[str]:
    db_schemas = {}
    for document in dbschema_retrieval:
        content = ast.literal_eval(document.content)
        if content["type"] == "TABLE":
            if document.meta["name"] not in db_schemas:
                db_schemas[document.meta["name"]] = content
            else:
                db_schemas[document.meta["name"]] = {
                    **content,
                    "columns": db_schemas[document.meta["name"]].get("columns", []),
                }
        elif content["type"] == "TABLE_COLUMNS":
            if document.meta["name"] not in db_schemas:
                db_schemas[document.meta["name"]] = {"columns": content["columns"]}
            else:
                if "columns" not in db_schemas[document.meta["name"]]:
                    db_schemas[document.meta["name"]]["columns"] = content["columns"]
                else:
                    db_schemas[document.meta["name"]]["columns"] += content["columns"]

    # remove incomplete schemas
    db_schemas = {k: v for k, v in db_schemas.items() if "type" in v and "columns" in v}

    db_schemas_in_ddl = []
    for table_schema in list(db_schemas.values()):
        if table_schema["type"] == "TABLE":
            ddl, _, _ = build_table_ddl(table_schema)
            db_schemas_in_ddl.append(ddl)

    return db_schemas_in_ddl


@observe(capture_input=False)
def prompt(
    query: str,
    analytics_docs: list[dict],
    construct_db_schemas: list[str],
    histories: list[AskHistory],
    prompt_builder: PromptBuilder,
    sql_samples: Optional[list[dict]] = None,
    instructions: Optional[list[dict]] = None,
    configuration: Configuration | dict | None = None,
) -> dict:
    # Handle configuration as dict or Configuration object
    if configuration is None:
        configuration = Configuration()
    elif isinstance(configuration, dict):
        # Convert dict to Configuration object
        configuration = Configuration(**configuration)

    _prompt = prompt_builder.run(
        query=query,
        language=configuration.language,
        db_schemas=construct_db_schemas,
        histories=histories,
        sql_samples=sql_samples,
        instructions=construct_instructions(
            instructions=instructions,
        ),
        docs=analytics_docs,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def classify_intent(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def post_process(classify_intent: dict, construct_db_schemas: list[str]) -> dict:
    try:
        results = orjson.loads(classify_intent.get("replies")[0])
        return {
            "rephrased_question": results["rephrased_question"],
            "intent": results["results"],
            "reasoning": results["reasoning"],
            "db_schemas": construct_db_schemas,
        }
    except Exception:
        return {
            "rephrased_question": "",
            "intent": "TEXT_TO_SQL",
            "reasoning": "",
            "db_schemas": construct_db_schemas,
        }


## End of Pipeline


class IntentClassificationResult(BaseModel):
    rephrased_question: str
    results: Literal["MISLEADING_QUERY", "TEXT_TO_SQL", "GENERAL", "USER_GUIDE"]
    reasoning: str


INTENT_CLASSIFICAION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "intent_classification",
            "schema": add_additional_properties_false(IntentClassificationResult.model_json_schema()),
        },
    }
}


class IntentClassification(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        embedder_provider: EmbedderProvider,
        document_store_provider: DocumentStoreProvider,
        analytics_docs: list[dict],
        table_retrieval_size: Optional[int] = 50,
        table_column_retrieval_size: Optional[int] = 100,
        **kwargs,
    ):
        self._components = {
            "embedder": embedder_provider.get_text_embedder(),
            "table_retriever": document_store_provider.get_retriever(
                document_store_provider.get_store(dataset_name="table_descriptions"),
                top_k=table_retrieval_size,
            ),
            "dbschema_retriever": document_store_provider.get_retriever(
                document_store_provider.get_store(),
                top_k=table_column_retrieval_size,
            ),
            "generator": llm_provider.get_generator(
                system_prompt=intent_classification_system_prompt,
                generation_kwargs=INTENT_CLASSIFICAION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "prompt_builder": PromptBuilder(
                template=intent_classification_user_prompt_template
            ),
        }

        self._configs = {
            "analytics_docs": analytics_docs,
        }

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Intent Classification")
    async def _execute(
        self,
        query: str,
        project_id: Optional[str] = None,
        histories: Optional[list[AskHistory]] = None,
        sql_samples: Optional[list[dict]] = None,
        instructions: Optional[list[dict]] = None,
        configuration: Configuration | dict = Configuration(),
    ):
        # Handle configuration as dict or Configuration object
        if isinstance(configuration, dict):
            configuration = Configuration(**configuration)
        logger.info("Intent Classification pipeline is running...")
        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "query": query,
                "project_id": project_id or "",
                "histories": histories or [],
                "sql_samples": sql_samples or [],
                "instructions": instructions or [],
                "configuration": configuration,
                **self._components,
                **self._configs,
            },
        )

    async def run(
        self,
        query: str,
        project_id: Optional[str] = None,
        histories: Optional[list[AskHistory]] = None,
        sql_samples: Optional[list[dict]] = None,
        instructions: Optional[list[dict]] = None,
        configuration: Configuration | dict = Configuration(),
    ):
        return await self._execute(
            query=query,
            project_id=project_id,
            histories=histories,
            sql_samples=sql_samples,
            instructions=instructions,
            configuration=configuration,
        )



