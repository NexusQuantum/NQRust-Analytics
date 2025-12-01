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
from src.pipelines.indexing import clean_display_name
from src.utils import trace_cost

logger = logging.getLogger("analytics-service")


system_prompt = """
### ROLE ###
You are an expert data modeler and business analyst who specializes in creating clear, meaningful descriptions for database models and columns that enhance data understanding and usability.

### TASK ###
Generate comprehensive, business-focused descriptions for data models and their columns based on user-provided context and requirements, ensuring descriptions are practical and actionable.

### DESCRIPTION PRINCIPLES ###
1. **Business Context**: Focus on business value and practical usage rather than technical details
2. **Clarity and Conciseness**: Write descriptions that are clear, informative, and easy to understand
3. **User-Centric Language**: Use terminology that business users can easily comprehend
4. **Contextual Relevance**: Base descriptions on the specific business context provided by the user
5. **Consistency**: Maintain consistent tone and style across all descriptions

### DESCRIPTION GUIDELINES ###
- **Model Descriptions**: Explain the overall purpose, business function, and key use cases
- **Column Descriptions**: Detail the specific role, data type implications, and business significance
- **Business Value**: Highlight how the model/column supports business operations or analysis
- **Data Relationships**: Mention key relationships or dependencies when relevant
- **Usage Context**: Provide guidance on when and how to use the data effectively

### CONTENT STRUCTURE ###
- **Purpose Statement**: What the model/column is for and why it exists
- **Business Context**: How it fits into the broader business process
- **Data Characteristics**: Key attributes, constraints, or special considerations
- **Usage Guidance**: How to effectively use this data for analysis or operations
- **Relationships**: How it connects to other data elements (when relevant)

### QUALITY STANDARDS ###
- **Accuracy**: Descriptions must accurately reflect the data structure and business context
- **Completeness**: Cover all essential aspects without being overly verbose
- **Actionability**: Provide information that helps users make better decisions
- **Consistency**: Use consistent terminology and formatting across all descriptions
- **Localization**: Adapt language and examples to the user's specified locale

### OUTPUT FORMAT ###
```json
{
  "models": [
    {
      "name": "<model_name>",
      "columns": [
        {
          "name": "<column_name>",
          "properties": {
            "description": "<business-focused column description>"
          }
        }
      ],
      "properties": {
        "description": "<business-focused model description>"
      }
    }
  ]
}
```
"""

user_prompt_template = """
### TASK ###
Generate comprehensive, business-focused descriptions for data models and their columns based on user-provided context and requirements, ensuring descriptions are practical and actionable.

### USER CONTEXT ###
User's prompt: {{ user_prompt }}
Picked models: {{ picked_models }}
Localization Language: {{ language }}

### DESCRIPTION REQUIREMENTS ###
- **Business Context**: Focus on business value and practical usage rather than technical details
- **Clarity and Conciseness**: Write descriptions that are clear, informative, and easy to understand
- **User-Centric Language**: Use terminology that business users can easily comprehend
- **Contextual Relevance**: Base descriptions on the specific business context provided by the user
- **Consistency**: Maintain consistent tone and style across all descriptions

### DESCRIPTION GUIDELINES ###
- **Model Descriptions**: Explain the overall purpose, business function, and key use cases
- **Column Descriptions**: Detail the specific role, data type implications, and business significance
- **Business Value**: Highlight how the model/column supports business operations or analysis
- **Data Relationships**: Mention key relationships or dependencies when relevant
- **Usage Context**: Provide guidance on when and how to use the data effectively

### CONTENT STRUCTURE ###
- **Purpose Statement**: What the model/column is for and why it exists
- **Business Context**: How it fits into the broader business process
- **Data Characteristics**: Key attributes, constraints, or special considerations
- **Usage Guidance**: How to effectively use this data for analysis or operations
- **Relationships**: How it connects to other data elements (when relevant)

### QUALITY STANDARDS ###
- **Accuracy**: Descriptions must accurately reflect the data structure and business context
- **Completeness**: Cover all essential aspects without being overly verbose
- **Actionability**: Provide information that helps users make better decisions
- **Consistency**: Use consistent terminology and formatting across all descriptions
- **Localization**: Adapt language and examples to the user's specified locale

Please provide comprehensive descriptions for the model and each column.
"""


## Start of Pipeline
@observe(capture_input=False)
def picked_models(mdl: dict, selected_models: list[str]) -> list[dict]:
    def relation_filter(column: dict) -> bool:
        return "relationship" not in column

    def column_formatter(columns: list[dict]) -> list[dict]:
        return [
            {
                "name": column["name"],
                "type": column["type"],
                "properties": {
                    "description": column["properties"].get("description", ""),
                    "alias": clean_display_name(
                        column["properties"].get("displayName", "")
                    ),
                },
            }
            for column in columns
            if relation_filter(column)
        ]

    def extract(model: dict) -> dict:
        return {
            "name": model["name"],
            "columns": column_formatter(model["columns"]),
            "properties": {
                "description": model["properties"].get("description", ""),
                "alias": clean_display_name(model["properties"].get("displayName", "")),
            },
        }

    return [
        extract(model)
        for model in mdl.get("models", [])
        if model.get("name", "") in selected_models
    ]


@observe(capture_input=False)
def prompt(
    picked_models: list[dict],
    user_prompt: str,
    prompt_builder: PromptBuilder,
    language: str,
) -> dict:
    _prompt = prompt_builder.run(
        picked_models=picked_models,
        user_prompt=user_prompt,
        language=language,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def normalize(generate: dict) -> dict:
    def wrapper(text: str) -> str:
        text = text.replace("\n", " ")
        text = " ".join(text.split())
        # Convert the normalized text to a dictionary
        try:
            text_dict = orjson.loads(text.strip())
            return text_dict
        except orjson.JSONDecodeError as e:
            logger.error(f"Error decoding JSON: {e}")
            return {"models": []}  # Return an empty list if JSON decoding fails

    reply = generate.get("replies")[0]  # Expecting only one reply
    normalized = wrapper(reply)

    return {model["name"]: model for model in normalized["models"]}


@observe(capture_input=False)
def output(normalize: dict, picked_models: list[dict]) -> dict:
    def _filter(enriched: list[dict], columns: list[dict]) -> list[dict]:
        valid_columns = [col["name"] for col in columns]

        return [col for col in enriched if col["name"] in valid_columns]

    models = {model["name"]: model for model in picked_models}

    return {
        name: {**data, "columns": _filter(data["columns"], models[name]["columns"])}
        for name, data in normalize.items()
        if name in models
    }


## End of Pipeline
class ModelProperties(BaseModel):
    description: str


class ModelColumns(BaseModel):
    name: str
    properties: ModelProperties


class SemanticModel(BaseModel):
    name: str
    columns: list[ModelColumns]
    properties: ModelProperties


class SemanticResult(BaseModel):
    models: list[SemanticModel]


SEMANTICS_DESCRIPTION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "semantic_description",
            "schema": SemanticResult.model_json_schema(),
        },
    }
}


class SemanticsDescription(EnhancedBasicPipeline):
    def __init__(self, llm_provider: LLMProvider, **_):
        self._components = {
            "prompt_builder": PromptBuilder(template=user_prompt_template),
            "generator": llm_provider.get_generator(
                system_prompt=system_prompt,
                generation_kwargs=SEMANTICS_DESCRIPTION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
        }
        self._final = "output"

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Semantics Description Generation")
    async def _execute(
        self,
        user_prompt: str,
        selected_models: list[str],
        mdl: dict,
        language: str = "en",
    ) -> dict:
        logger.info("Semantics Description Generation pipeline is running...")
        return await self._pipe.execute(
            [self._final],
            inputs={
                "user_prompt": user_prompt,
                "selected_models": selected_models,
                "mdl": mdl,
                "language": language,
                **self._components,
            },
        )

    async def run(
        self,
        user_prompt: str,
        selected_models: list[str],
        mdl: dict,
        language: str = "en",
    ) -> dict:
        return await self._execute(
            user_prompt=user_prompt,
            selected_models=selected_models,
            mdl=mdl,
            language=language,
        )



