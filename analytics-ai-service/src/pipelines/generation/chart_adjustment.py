import logging
import sys
from typing import Any, Dict

import orjson
from hamilton import base
from hamilton.async_driver import AsyncDriver
from haystack.components.builders.prompt_builder import PromptBuilder
from langfuse.decorators import observe

from src.core.pipeline import EnhancedBasicPipeline
from src.core.provider import LLMProvider
from src.pipelines.common import clean_up_new_lines
from src.pipelines.generation.utils.chart import (
    ChartDataPreprocessor,
    ChartGenerationPostProcessor,
    ChartGenerationResults,
    chart_generation_instructions,
)
from src.utils import add_additional_properties_false, trace_cost
from src.web.v1.services.chart_adjustment import ChartAdjustmentOption

logger = logging.getLogger("analytics-service")


chart_adjustment_system_prompt = f"""
### ROLE ###
You are an expert data visualization specialist who excels at refining and optimizing chart configurations based on user feedback and data characteristics.

### TASK ###
Analyze user adjustment requests and modify existing Vega-Lite chart schemas to better serve the user's visualization goals while maintaining data integrity and visual clarity.

### ADJUSTMENT PRINCIPLES ###
1. **User Intent Respect**: Honor the user's specific adjustment requests when technically feasible
2. **Data Compatibility**: Ensure adjustments work with the actual data structure and values
3. **Visual Effectiveness**: Maintain or improve the chart's ability to communicate insights
4. **Technical Validity**: Generate valid Vega-Lite schemas that will render correctly
5. **Contextual Awareness**: Consider the original question and data context when making changes

### ADJUSTMENT EVALUATION ###
- **Feasible Adjustments**: Implement when data supports the requested changes
- **Alternative Suggestions**: Offer better options when user requests aren't optimal
- **Rejection with Explanation**: Decline adjustments that would misrepresent data or break functionality
- **Data-Driven Decisions**: Prioritize what the data can actually show over user preferences

### REASONING REQUIREMENTS ###
- Explain how the adjustment improves the visualization
- Address any limitations or trade-offs in the new configuration
- Highlight what insights the adjusted chart will better reveal
- If rejecting adjustments, clearly explain why and suggest alternatives
- Consider the impact on readability and user comprehension

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly
- **CRITICAL**: If user asks in English, respond ONLY in English. If user asks in Chinese, respond ONLY in Chinese
- **NO LANGUAGE CONFUSION**: Do not mix languages or respond in wrong language

{chart_generation_instructions}

### REJECTION CRITERIA ###
- Adjustments that would misrepresent the data
- Changes that break Vega-Lite syntax or functionality
- Modifications that make the chart less readable or informative
- Requests that don't align with the data structure or question intent

### OUTPUT FORMAT ###
```json
{{
    "reasoning": "<explanation of adjustment decision in user's language>",
    "chart_type": "line|multi_line|bar|pie|grouped_bar|stacked_bar|area|",
    "chart_schema": <VEGA_LITE_JSON_SCHEMA_OR_EMPTY_STRING>
}}
```
"""

chart_adjustment_user_prompt_template = """
### TASK ###
Analyze the user's chart adjustment requests and modify the existing Vega-Lite configuration to better serve their visualization goals while maintaining data integrity.

### CHART CONTEXT ###
Original Question: {{ query }}
Original SQL: {{ sql }}
Original Vega-Lite Schema: {{ chart_schema }}
Sample Data: {{ sample_data }}
Sample Column Values: {{ sample_column_values }}
Language: {{ language }}

### ADJUSTMENT REQUEST ###
- Chart Type: {{ adjustment_option.chart_type }}
{% if adjustment_option.chart_type != "pie" %}
{% if adjustment_option.x_axis %}
- X Axis: {{ adjustment_option.x_axis }}
{% endif %}
{% if adjustment_option.y_axis %}
- Y Axis: {{ adjustment_option.y_axis }}
{% endif %}
{% endif %}
{% if adjustment_option.x_offset and adjustment_option.chart_type == "grouped_bar" %}
- X Offset: {{ adjustment_option.x_offset }}
{% endif %}
{% if adjustment_option.color and adjustment_option.chart_type != "area" %}
- Color: {{ adjustment_option.color }}
{% endif %}
{% if adjustment_option.theta and adjustment_option.chart_type == "pie" %}
- Theta: {{ adjustment_option.theta }}
{% endif %}

### ADJUSTMENT EVALUATION ###
- **Feasibility Assessment**: Determine if the requested adjustments are technically possible
- **Data Compatibility**: Verify the adjustments work with the actual data structure
- **Visual Impact**: Consider how changes affect chart readability and insight communication
- **Alternative Options**: Suggest better approaches if the requested changes aren't optimal
- **Rejection Criteria**: Decline adjustments that would misrepresent data or break functionality

### VEGA-LITE SCHEMA VALIDATION ###
- **Required Fields**: Ensure all mandatory Vega-Lite fields are present
- **Data Types**: Verify field types match the actual data structure
- **Encoding Validity**: Check that encoding specifications are correct
- **Schema Compliance**: Follow Vega-Lite schema standards strictly
- **Error Prevention**: Avoid common Vega-Lite schema errors

### QUALITY STANDARDS ###
- **Data Integrity**: Ensure adjustments don't misrepresent the underlying data
- **Visual Clarity**: Maintain or improve chart readability and insight communication
- **Technical Validity**: Generate valid Vega-Lite schemas that will render correctly
- **User Intent**: Honor user preferences when technically feasible and data-appropriate
- **Performance**: Consider the impact on chart rendering and interaction performance

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Variable**: Use the specified language from the Language field above
- **Explicit Language**: The user has specified language as "{{ language }}" - respond in that language only
- **CRITICAL**: If language is "English", respond ONLY in English. If language is "Chinese", respond ONLY in Chinese
- **NO LANGUAGE CONFUSION**: Do not mix languages or respond in wrong language

Please think step by step and provide the optimal adjusted chart configuration.
"""


## Start of Pipeline
@observe(capture_input=False)
def preprocess_data(
    data: Dict[str, Any], chart_data_preprocessor: ChartDataPreprocessor
) -> dict:
    return chart_data_preprocessor.run(data)


@observe(capture_input=False)
def prompt(
    query: str,
    sql: str,
    adjustment_option: ChartAdjustmentOption,
    chart_schema: dict,
    preprocess_data: dict,
    language: str,
    prompt_builder: PromptBuilder,
) -> dict:
    sample_data = preprocess_data.get("sample_data")
    sample_column_values = preprocess_data.get("sample_column_values")

    _prompt = prompt_builder.run(
        query=query,
        sql=sql,
        adjustment_option=adjustment_option,
        chart_schema=chart_schema,
        sample_data=sample_data,
        sample_column_values=sample_column_values,
        language=language,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_chart_adjustment(
    prompt: dict,
    generator: Any,
    generator_name: str,
) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def post_process(
    generate_chart_adjustment: dict,
    vega_schema: Dict[str, Any],
    preprocess_data: dict,
    post_processor: ChartGenerationPostProcessor,
) -> dict:
    return post_processor.run(
        generate_chart_adjustment.get("replies"),
        vega_schema,
        preprocess_data["sample_data"],
    )


## End of Pipeline
CHART_ADJUSTMENT_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "chart_adjustment_results",
            "schema": add_additional_properties_false(ChartGenerationResults.model_json_schema()),
        },
    }
}


class ChartAdjustment(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(
                template=chart_adjustment_user_prompt_template
            ),
            "generator": llm_provider.get_generator(
                system_prompt=chart_adjustment_system_prompt,
                generation_kwargs=CHART_ADJUSTMENT_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
            "chart_data_preprocessor": ChartDataPreprocessor(),
            "post_processor": ChartGenerationPostProcessor(),
        }

        with open("src/pipelines/generation/utils/vega-lite-schema-v5.json", "r") as f:
            _vega_schema = orjson.loads(f.read())

        self._configs = {
            "vega_schema": _vega_schema,
        }
        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Chart Adjustment")
    async def _execute(
        self,
        query: str,
        sql: str,
        adjustment_option: ChartAdjustmentOption,
        chart_schema: dict,
        data: dict,
        language: str,
    ) -> dict:
        logger.info("Chart Adjustment pipeline is running...")

        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "query": query,
                "sql": sql,
                "adjustment_option": adjustment_option,
                "chart_schema": chart_schema,
                "data": data,
                "language": language,
                **self._components,
                **self._configs,
            },
        )

    async def run(
        self,
        query: str,
        sql: str,
        adjustment_option: ChartAdjustmentOption,
        chart_schema: dict,
        data: dict,
        language: str,
    ) -> dict:
        return await self._execute(
            query=query,
            sql=sql,
            adjustment_option=adjustment_option,
            chart_schema=chart_schema,
            data=data,
            language=language,
        )



