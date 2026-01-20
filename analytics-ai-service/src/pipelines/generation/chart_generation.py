import logging
import sys
from typing import Any, Dict, Optional

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

logger = logging.getLogger("analytics-service")

chart_generation_system_prompt = f"""
### ROLE ###
You are an expert data visualization specialist who creates compelling, accurate charts using Vega-Lite to help users understand their data insights.

### TASK ###
Analyze user questions, SQL queries, and sample data to generate optimal Vega-Lite chart schemas that effectively communicate the data story.

### VISUALIZATION PRINCIPLES ###
1. **Data-Driven Design**: Choose chart types that best represent the data relationships and patterns
2. **User Intent Alignment**: Match visualization to what the user wants to discover or communicate
3. **Clarity Over Complexity**: Prioritize clear, readable charts over fancy but confusing visualizations
4. **Context Awareness**: Consider the data structure, value ranges, and categorical relationships
5. **Accessibility**: Ensure charts are interpretable by users with different technical backgrounds

### CHART SELECTION LOGIC ###
- **Line Charts**: For trends over time, continuous data, or sequential relationships
- **Bar Charts**: For categorical comparisons, rankings, or discrete value comparisons
- **Pie Charts**: For part-to-whole relationships with limited categories (≤6)
- **Area Charts**: For cumulative data or stacked time series
- **Grouped/Stacked Bars**: For multi-dimensional categorical analysis

### REASONING REQUIREMENTS ###
- Explain why the chosen chart type fits the data and question
- Highlight key data patterns or relationships the chart will reveal
- Consider data distribution, outliers, and scale
- Mention any data transformations or aggregations needed
- Address potential visualization challenges or limitations

### VEGA-LITE SCHEMA VALIDATION ###
- **Required Fields**: Ensure all mandatory Vega-Lite fields are present
- **Data Types**: Verify field types match the actual data structure
- **Encoding Validity**: Check that encoding specifications are correct
- **Schema Compliance**: Follow Vega-Lite schema standards strictly
- **Error Prevention**: Avoid common Vega-Lite schema errors

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Detection**: Detect the user's language from their question and respond accordingly
- **CRITICAL**: If user asks in English, respond ONLY in English. If user asks in Chinese, respond ONLY in Chinese
- **NO LANGUAGE CONFUSION**: Do not mix languages or respond in wrong language

{chart_generation_instructions}

### CUSTOM INSTRUCTIONS ###
- If user provides custom instructions, follow them strictly for reasoning style
- Adapt the explanation tone and detail level to user preferences
- Maintain technical accuracy while being responsive to user needs

### OUTPUT FORMAT ###
```json
{{
    "reasoning": "<clear explanation of chart choice in user's language>",
    "chart_type": "line|multi_line|bar|pie|grouped_bar|stacked_bar|area|",
    "chart_schema": <VEGA_LITE_JSON_SCHEMA>
}}
```
"""

chart_generation_user_prompt_template = """
### TASK ###
Create an optimal Vega-Lite chart configuration that effectively visualizes the data to answer the user's analytical question.

### ANALYTICAL CONTEXT ###
Question: {{ query }}
SQL: {{ sql }}
Sample Data: {{ sample_data }}
Sample Column Values: {{ sample_column_values }}
Language: {{ language }}
Custom Instruction: {{ custom_instruction }}

### CHART GENERATION GUIDELINES ###
- **Data Analysis**: Examine the sample data to understand data types, ranges, and patterns
- **Question Alignment**: Choose chart type that best answers the user's analytical question
- **Visual Effectiveness**: Ensure the chart clearly communicates the key insights
- **Data Compatibility**: Verify the chart configuration works with the actual data structure
- **User Preferences**: Incorporate any custom instructions for chart style or focus

### VEGA-LITE SCHEMA VALIDATION ###
- **Required Fields**: Ensure all mandatory Vega-Lite fields are present
- **Data Types**: Verify field types match the actual data structure
- **Encoding Validity**: Check that encoding specifications are correct
- **Schema Compliance**: Follow Vega-Lite schema standards strictly
- **Error Prevention**: Avoid common Vega-Lite schema errors

### LANGUAGE REQUIREMENTS ###
- **Response Language**: Always respond in the same language as the user's question
- **Consistent Language**: Maintain the user's specified language throughout the response
- **No Language Mixing**: Do not switch between languages in the same response
- **Language Variable**: Use the specified language from the Language field above
- **Explicit Language**: The user has specified language as "{{ language }}" - respond in that language only
- **CRITICAL**: If language is "English", respond ONLY in English. If language is "Chinese", respond ONLY in Chinese
- **NO LANGUAGE CONFUSION**: Do not mix languages or respond in wrong language

### CONSIDERATIONS ###
- **Data Distribution**: Consider how the data is distributed across categories or time
- **Value Ranges**: Ensure appropriate scaling and axis configuration
- **Categorical Data**: Handle categorical variables appropriately
- **Time Series**: Use appropriate time-based visualizations for temporal data
- **Comparisons**: Enable effective comparisons between different data segments

Please think step by step and create the optimal chart configuration.
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
    preprocess_data: dict,
    language: str,
    custom_instruction: str,
    prompt_builder: PromptBuilder,
) -> dict:
    sample_data = preprocess_data.get("sample_data")
    sample_column_values = preprocess_data.get("sample_column_values")

    _prompt = prompt_builder.run(
        query=query,
        sql=sql,
        sample_data=sample_data,
        sample_column_values=sample_column_values,
        language=language,
        custom_instruction=custom_instruction,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate_chart(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def post_process(
    generate_chart: dict,
    vega_schema: Dict[str, Any],
    remove_data_from_chart_schema: bool,
    preprocess_data: dict,
    post_processor: ChartGenerationPostProcessor,
) -> dict:
    return post_processor.run(
        generate_chart.get("replies"),
        vega_schema,
        preprocess_data["sample_data"],
        remove_data_from_chart_schema,
    )


## End of Pipeline
CHART_GENERATION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "chart_generation_schema",
            "schema": add_additional_properties_false(ChartGenerationResults.model_json_schema()),
        },
    }
}


class ChartGeneration(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **kwargs,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(
                template=chart_generation_user_prompt_template
            ),
            "generator": llm_provider.get_generator(
                system_prompt=chart_generation_system_prompt,
                generation_kwargs=CHART_GENERATION_MODEL_KWARGS,
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

    @observe(name="Chart Generation")
    async def _execute(
        self,
        query: str,
        sql: str,
        data: dict,
        language: str,
        remove_data_from_chart_schema: bool = True,
        custom_instruction: Optional[str] = None,
    ) -> dict:
        logger.info("Chart Generation pipeline is running...")
        return await self._pipe.execute(
            ["post_process"],
            inputs={
                "query": query,
                "sql": sql,
                "data": data,
                "language": language,
                "remove_data_from_chart_schema": remove_data_from_chart_schema,
                "custom_instruction": custom_instruction or "",
                **self._components,
                **self._configs,
            },
        )

    async def run(
        self,
        query: str,
        sql: str,
        data: dict,
        language: str,
        remove_data_from_chart_schema: bool = True,
        custom_instruction: Optional[str] = None,
    ) -> dict:
        return await self._execute(
            query=query,
            sql=sql,
            data=data,
            language=language,
            remove_data_from_chart_schema=remove_data_from_chart_schema,
            custom_instruction=custom_instruction,
        )



