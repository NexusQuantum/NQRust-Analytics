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
from src.utils import add_additional_properties_false, trace_cost

logger = logging.getLogger("analytics-service")


system_prompt = """
### ROLE ###
You are an expert data analyst and business intelligence consultant who specializes in generating insightful, actionable questions that unlock the analytical potential of any dataset.

### TASK ###
Create diverse, high-quality analytical questions that help users discover valuable insights from their data model, with optional focus on specific categories and user context.

### QUESTION GENERATION PRINCIPLES ###
1. **Insight-Driven**: Focus on questions that reveal meaningful business insights
2. **Data-Aligned**: Ensure all questions can be answered with the available data model
3. **Diverse Perspectives**: Cover different analytical angles and business scenarios
4. **Balanced Distribution**: Distribute questions evenly across provided categories
5. **Context-Aware**: Build upon user's previous questions when provided
6. **Always Generate**: Never return empty results - always provide meaningful questions

### ANALYTICAL TECHNIQUES ###
- **Drill-Down Analysis**: Deep dive into specific data segments or time periods
- **Roll-Up Aggregation**: Summarize data at higher organizational levels
- **Slice and Dice**: Analyze data from multiple dimensional perspectives
- **Trend Analysis**: Identify patterns, changes, and trajectories over time
- **Comparative Analysis**: Compare segments, groups, or time periods
- **Segmentation**: Identify meaningful data groupings and patterns

### CATEGORY FRAMEWORK ###

**Descriptive Questions**
- Summarize historical data and current states
- Example: "What was the total sales volume for each product last quarter?"

**Segmentation Questions**
- Identify meaningful data segments and groupings
- Example: "Which customer segments contributed most to revenue growth?"

**Comparative Questions**
- Compare data across segments, periods, or dimensions
- Example: "How did Product A perform compared to Product B last year?"

**Data Quality/Accuracy Questions**
- Assess data reliability, completeness, and consistency
- Example: "Are there inconsistencies in the sales records for Q1?"

### GENERATION STRATEGY ###
- **Randomization**: Randomly select and distribute categories to avoid bias
- **Balanced Coverage**: Ensure no single category dominates the output
- **Context Integration**: Build upon user's previous questions when provided
- **Complexity Mix**: Include both simple and sophisticated analytical questions
- **Actionable Focus**: Generate questions that lead to concrete business insights
- **Fallback Questions**: Always have generic questions ready if context is unclear

### QUALITY STANDARDS ###
- **Specificity**: Avoid vague or open-ended questions
- **Answerability**: Ensure questions can be definitively answered with the data
- **Business Relevance**: Focus on questions that matter to business stakeholders
- **Technical Feasibility**: Consider the complexity of required SQL queries
- **Time Awareness**: Incorporate temporal analysis where relevant
- **Robustness**: Generate questions even when data context is limited

### FALLBACK STRATEGY ###
If the data model is unclear or limited, generate general analytical questions that are commonly useful:
- "What are the top performing categories by revenue?"
- "How has performance changed over time?"
- "Which segments show the highest growth?"
- "What are the key trends in the data?"
- "Which factors contribute most to success?"

### OUTPUT FORMAT ###
```json
{
  "questions": [
    {
      "question": "<insightful analytical question>",
      "category": "<question category>"
    }
  ]
}
```
"""

user_prompt_template = """
### TASK ###
Generate diverse, high-quality analytical questions that help users discover valuable insights from their data model, with optional focus on specific categories and user context.

### CONTEXT INFORMATION ###
{% if previous_questions %}
Previous Questions: {{previous_questions}}
{% endif %}

{% if categories %}
Categories: {{categories}}
{% endif %}

{% if documents %}
### DATABASE SCHEMA ###
{% for document in documents %}
    {{ document }}
{% endfor %}
{% endif %}

### GENERATION REQUIREMENTS ###
- **Question Count**: Generate {{max_questions}} questions for each of the {{max_categories}} categories
- **Language Localization**: Translate questions and category names into {{language}}
- **Context Awareness**: {% if user_question %}Build upon the user's previous question{% else %}Cover diverse analytical angles{% endif %}
- **Quality Standards**: Ensure questions are specific, answerable, and business-relevant
- **Balanced Distribution**: Distribute questions evenly across categories
- **Always Generate**: Never return empty results - always provide meaningful questions

### QUESTION QUALITY CRITERIA ###
- **Specificity**: Avoid vague or open-ended questions
- **Answerability**: Ensure questions can be definitively answered with the data
- **Business Relevance**: Focus on questions that matter to business stakeholders
- **Technical Feasibility**: Consider the complexity of required SQL queries
- **Analytical Depth**: Include both simple and sophisticated analytical questions
- **Robustness**: Generate questions even when data context is limited

### CATEGORY DISTRIBUTION ###
- **Random Selection**: Randomly select and distribute categories to avoid bias
- **Balanced Coverage**: Ensure no single category dominates the output
- **Diverse Perspectives**: Cover different analytical angles within each category
- **Progressive Complexity**: Include questions of varying analytical sophistication

### FALLBACK STRATEGY ###
If the data model is unclear or limited, generate general analytical questions that are commonly useful:
- "What are the top performing categories by revenue?"
- "How has performance changed over time?"
- "Which segments show the highest growth?"
- "What are the key trends in the data?"
- "Which factors contribute most to success?"

### ERROR HANDLING ###
- **Always Generate**: Even if context is unclear, generate meaningful questions
- **Generic Fallback**: Use general business questions if specific context fails
- **Quality Focus**: Prioritize question quality over perfect context matching
- **Robustness**: Ensure recommendations are always available

Please generate the requested questions following these guidelines.
"""


## Start of Pipeline
@observe(capture_input=False)
def prompt(
    previous_questions: list[str],
    documents: list,
    language: str,
    max_questions: int,
    max_categories: int,
    prompt_builder: PromptBuilder,
) -> dict:
    """
    If previous_questions is provided, the MDL is omitted to allow the LLM to focus on
    generating recommendations based on the question history. This helps provide more
    contextually relevant questions that build on previous questions.
    """

    _prompt = prompt_builder.run(
        documents=documents,
        previous_questions=previous_questions,
        language=language,
        max_questions=max_questions,
        max_categories=max_categories,
    )
    return {"prompt": clean_up_new_lines(_prompt.get("prompt"))}


@observe(as_type="generation", capture_input=False)
@trace_cost
async def generate(prompt: dict, generator: Any, generator_name: str) -> dict:
    return await generator(prompt=prompt.get("prompt")), generator_name


@observe(capture_input=False)
def normalized(generate: dict) -> dict:
    def wrapper(text: str) -> list:
        text = text.replace("\n", " ")
        text = " ".join(text.split())
        try:
            text_list = orjson.loads(text.strip())

            # If no questions generated, provide fallback questions
            if not text_list or not text_list.get("questions", []):
                logger.warning("No questions generated, providing fallback questions")
                return {
                    "questions": [
                        {
                            "question": "What are the top performing categories by revenue?",
                            "category": "Descriptive Questions",
                        },
                        {
                            "question": "How has performance changed over time?",
                            "category": "Comparative Questions",
                        },
                        {
                            "question": "Which segments show the highest growth?",
                            "category": "Segmentation Questions",
                        },
                        {
                            "question": "What are the key trends in the data?",
                            "category": "Descriptive Questions",
                        },
                        {
                            "question": "Which factors contribute most to success?",
                            "category": "Data Quality/Accuracy Questions",
                        },
                    ]
                }

            return text_list
        except orjson.JSONDecodeError as e:
            logger.error(f"Error decoding JSON: {e}")
            # Return fallback questions on JSON error
            return {
                "questions": [
                    {
                        "question": "What are the top performing categories by revenue?",
                        "category": "Descriptive Questions",
                    },
                    {
                        "question": "How has performance changed over time?",
                        "category": "Comparative Questions",
                    },
                    {
                        "question": "Which segments show the highest growth?",
                        "category": "Segmentation Questions",
                    },
                ]
            }
        except Exception as e:
            logger.error(f"Unexpected error in question generation: {e}")
            # Return fallback questions on any error
            return {
                "questions": [
                    {
                        "question": "What are the key trends in the data?",
                        "category": "Descriptive Questions",
                    },
                    {
                        "question": "Which factors contribute most to success?",
                        "category": "Data Quality/Accuracy Questions",
                    },
                ]
            }

    try:
        replies = generate.get("replies", [])
        if not replies:
            logger.warning("No replies generated, providing fallback questions")
            return {
                "questions": [
                    {
                        "question": "What are the top performing categories by revenue?",
                        "category": "Descriptive Questions",
                    },
                    {
                        "question": "How has performance changed over time?",
                        "category": "Comparative Questions",
                    },
                ]
            }

        reply = replies[0]  # Expecting only one reply
        normalized = wrapper(reply)
        return normalized
    except Exception as e:
        logger.error(f"Error processing question generation: {e}")
        # Return fallback questions on any error
        return {
            "questions": [
                {
                    "question": "What are the key trends in the data?",
                    "category": "Descriptive Questions",
                },
                {
                    "question": "Which factors contribute most to success?",
                    "category": "Data Quality/Accuracy Questions",
                },
            ]
        }


## End of Pipeline
class Question(BaseModel):
    question: str
    category: str


class QuestionResult(BaseModel):
    questions: list[Question]


QUESTION_RECOMMENDATION_MODEL_KWARGS = {
    "response_format": {
        "type": "json_schema",
        "json_schema": {
            "name": "question_recommendation",
            "schema": add_additional_properties_false(QuestionResult.model_json_schema()),
        },
    }
}


class QuestionRecommendation(EnhancedBasicPipeline):
    def __init__(
        self,
        llm_provider: LLMProvider,
        **_,
    ):
        self._components = {
            "prompt_builder": PromptBuilder(template=user_prompt_template),
            "generator": llm_provider.get_generator(
                system_prompt=system_prompt,
                generation_kwargs=QUESTION_RECOMMENDATION_MODEL_KWARGS,
            ),
            "generator_name": llm_provider.get_model(),
        }

        self._final = "normalized"

        super().__init__(
            AsyncDriver({}, sys.modules[__name__], result_builder=base.DictResult())
        )

    @observe(name="Question Recommendation")
    async def _execute(
        self,
        contexts: list[str],
        previous_questions: list[str] = [],
        categories: list[str] = [],
        language: str = "en",
        max_questions: int = 5,
        max_categories: int = 3,
        **_,
    ) -> dict:
        logger.info("Question Recommendation pipeline is running...")
        return await self._pipe.execute(
            [self._final],
            inputs={
                "documents": contexts,
                "previous_questions": previous_questions,
                "categories": categories,
                "language": language,
                "max_questions": max_questions,
                "max_categories": max_categories,
                **self._components,
            },
        )

    async def run(
        self,
        contexts: list[str],
        previous_questions: list[str] = [],
        categories: list[str] = [],
        language: str = "en",
        max_questions: int = 5,
        max_categories: int = 3,
        **_,
    ) -> dict:
        return await self._execute(
            contexts=contexts,
            previous_questions=previous_questions,
            categories=categories,
            language=language,
            max_questions=max_questions,
            max_categories=max_categories,
        )



