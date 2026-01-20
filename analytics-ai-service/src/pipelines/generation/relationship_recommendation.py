import logging
import sys
from enum import Enum
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
from src.utils import add_additional_properties_false, trace_cost

logger = logging.getLogger("analytics-service")


system_prompt = """
### ROLE ###
You are an expert database architect and data modeling specialist who excels at identifying optimal relationships between data models to enhance analytical capabilities and data integrity.

### TASK ###
Analyze data model specifications and recommend meaningful relationships that improve data connectivity, analytical potential, and business value while maintaining data integrity.

### RELATIONSHIP ANALYSIS PRINCIPLES ###
1. **Business Value Focus**: Recommend relationships that enable meaningful business analysis
2. **Data Integrity**: Ensure relationships maintain referential integrity and logical consistency
3. **Analytical Enhancement**: Prioritize relationships that unlock analytical capabilities
4. **Performance Consideration**: Consider the impact on query performance and data access patterns
5. **Practical Implementation**: Focus on relationships that are technically feasible and maintainable

### RELATIONSHIP EVALUATION CRITERIA ###
- **Semantic Validity**: The relationship must make logical business sense
- **Data Compatibility**: Column types and values should be compatible for joining
- **Uniqueness Requirements**: Consider cardinality and uniqueness constraints
- **Cross-Model Only**: Never recommend relationships within the same model
- **Benefit Assessment**: Only recommend relationships that provide clear analytical or business value

### RELATIONSHIP TYPES ###
- **MANY_TO_ONE**: Multiple records in source model relate to one record in target model
- **ONE_TO_MANY**: One record in source model relates to multiple records in target model  
- **ONE_TO_ONE**: One-to-one correspondence between models
- **Avoid MANY_TO_MANY**: Use intermediate models or separate relationships instead

### RECOMMENDATION GUIDELINES ###
- **Clear Business Logic**: Each relationship should have a clear business justification
- **Data Quality**: Ensure the relationship improves data quality and consistency
- **Query Enhancement**: Consider how the relationship enables better analytical queries
- **Maintenance Feasibility**: Ensure the relationship can be maintained over time
- **Performance Impact**: Consider the computational cost of maintaining the relationship

### REJECTION CRITERIA ###
- Relationships that don't make business sense
- Relationships within the same model
- Relationships that would degrade data quality
- Relationships with insufficient data to support them
- Relationships that are too complex to maintain

### OUTPUT FORMAT ###
```json
{
  "relationships": [
    {
      "name": "<descriptive relationship name>",
      "fromModel": "<source model name>",
      "fromColumn": "<source column name>",
      "type": "MANY_TO_ONE|ONE_TO_MANY|ONE_TO_ONE",
      "toModel": "<target model name>",
      "toColumn": "<target column name>",
      "reason": "<business justification for this relationship>"
    }
  ]
}
```

If no beneficial relationships are found, return:
```json
{
  "relationships": []
}
```
"""

user_prompt_template = """
### TASK ###
Analyze the provided data model and recommend meaningful relationships that improve data connectivity, analytical potential, and business value while maintaining data integrity.

### DATA MODEL SPECIFICATION ###
{{models}}

### ANALYSIS REQUIREMENTS ###
- **Relationship Identification**: Identify potential relationships between models
- **Business Value Assessment**: Evaluate how relationships enable meaningful analysis
- **Data Integrity**: Ensure relationships maintain referential integrity and logical consistency
- **Performance Consideration**: Consider the impact on query performance and data access patterns
- **Localization**: Use {{language}} for relationship names and reasoning

### RELATIONSHIP EVALUATION CRITERIA ###
- **Semantic Validity**: The relationship must make logical business sense
- **Data Compatibility**: Column types and values should be compatible for joining
- **Uniqueness Requirements**: Consider cardinality and uniqueness constraints
- **Cross-Model Only**: Never recommend relationships within the same model
- **Benefit Assessment**: Only recommend relationships that provide clear analytical or business value

### RECOMMENDATION GUIDELINES ###
- **Clear Business Logic**: Each relationship should have a clear business justification
- **Data Quality**: Ensure the relationship improves data quality and consistency
- **Query Enhancement**: Consider how the relationship enables better analytical queries
- **Maintenance Feasibility**: Ensure the relationship can be maintained over time
- **Performance Impact**: Consider the computational cost of maintaining the relationship

### REJECTION CRITERIA ###
- Relationships that don't make business sense
- Relationships within the same model
- Relationships that would degrade data quality
- Relationships with insufficient data to support them
- Relationships that are too complex to maintain

Please analyze the models and provide relationship recommendations.
"""


## Start of Pipeline
@observe(capture_input=False)
def cleaned_models(mdl: dict) -> dict:
    def remove_display_name(d: dict) -> dict:
        if "properties" in d and isinstance(d["properties"], dict):
            d["properties"] = d["properties"].copy()
            d["properties"].pop("displayName", None)
        return d

    def column_filter(columns: list[dict]) -> list[dict]:
        filtered_columns = []
        for column in columns:
            if "relationship" not in column:
                # Create a copy of the column to avoid modifying the original
                filtered_column = column.copy()
                filtered_column = remove_display_name(filtered_column)
                filtered_columns.append(filtered_column)
        return filtered_columns

    return [
        remove_display_name(
            {**model, "columns": column_filter(model.get("columns", []))}
        )
        for model in mdl.get("models", [])
    ]


@observe(capture_input=False)
def prompt(
    cleaned_models: dict,
    prompt_builder: PromptBuilder,
    language: str,
) -> dict:
    _prompt = prompt_builder.run(models=cleaned_models, language=language)
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def normalized(generate: dict) -> dict:
    def wrapper(text: str) -> str:
        text = text.replace("\n", " ")
        text = " ".join(text.split())
        # Convert the normalized text to a dictionary
        try:
            text_dict = orjson.loads(text.strip())
            return text_dict
        except orjson.JSONDecodeError as e:
            logger.error(f"Error decoding JSON: {e}")
            return {}  # Return an empty dictionary if JSON decoding fails

    reply = generate.get("replies")[0]  # Expecting only one reply
    normalized = wrapper(reply)

    return normalized


@observe(capture_input=False)
def validated(normalized: dict, mdl: dict) -> dict:
    model_columns = {
        model["name"]: set(
            [
                column["name"]
                for column in model.get("columns", [])
                if not column.get("relationship")
            ]
        )
        for model in mdl.get("models", [])
    }

    relationships = normalized.get("relationships", [])
    validated_relationships = [
        relationship
        for relationship in relationships
        if RelationType.is_include(relationship.get("type"))
        and relationship.get("fromModel") in model_columns
        and relationship.get("toModel") in model_columns
        and relationship.get("fromColumn")
        in model_columns.get(relationship.get("fromModel"))
        and relationship.get("toColumn")
        in model_columns.get(relationship.get("toModel"))
    ]

    return {"relationships": validated_relationships}


## End of Pipeline
class RelationType(Enum):
    MANY_TO_ONE = "MANY_TO_ONE"
    ONE_TO_MANY = "ONE_TO_MANY"
    ONE_TO_ONE = "ONE_TO_ONE"

    @classmethod
    def is_include(cls, value: str) -> bool:
        return value in cls._value2member_map_


class ModelRelationship(BaseModel):
    name: str
    fromModel: str
    fromColumn: str
    type: RelationType
    toModel: str
    toColumn: str
    reason: str


class RelationshipResult(BaseModel):
    relationships: list[ModelRelationship]


RELATIONSHIP_RECOMMENDATION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "semantic_description",
            "schema": add_additional_properties_false(RelationshipResult.model_json_schema()),
        },
    }
}


class RelationshipRecommendation(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **_,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(template=user_prompt_template),
            "generator": llm_provider.get_generator(
                system_prompt=system_prompt,
                generation_kwargs=RELATIONSHIP_RECOMMENDATION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
        }

        self._final = "validated"

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Relationship Recommendation")
    async def _execute(
        self,
        mdl: dict,
        language: str = "English",
    ) -> dict:
        logger.info("Relationship Recommendation pipeline is running...")
        return await self._pipe.execute(
            [self._final],
            inputs={
                "mdl": mdl,
                "language": language,
                **self._components,
            },
        )

    async def run(
        self,
        mdl: dict,
        language: str = "English",
    ) -> dict:
        return await self._execute(mdl=mdl, language=language)



