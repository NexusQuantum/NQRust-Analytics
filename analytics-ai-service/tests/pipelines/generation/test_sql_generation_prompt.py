"""Tests for sql_generation prompt template — focus on the new
document_context injection. Verifies:

1. Without document_context, the prompt is unchanged (no regression).
2. With document_context, the new section is rendered with correct
   filename/page citation format.
3. Mixed inputs (document_context + instructions + sql_samples) all coexist.
"""
from haystack.components.builders.prompt_builder import PromptBuilder

from src.pipelines.generation.sql_generation import sql_generation_user_prompt_template


def _render(**kwargs) -> str:
    pb = PromptBuilder(template=sql_generation_user_prompt_template)
    return pb.run(
        query=kwargs.get("query", "show revenue"),
        documents=kwargs.get("documents", ["TABLE orders (id INT, amount NUMERIC)"]),
        sql_generation_reasoning=kwargs.get("sql_generation_reasoning", None),
        instructions=kwargs.get("instructions", None),
        calculated_field_instructions=kwargs.get("calculated_field_instructions", ""),
        metric_instructions=kwargs.get("metric_instructions", ""),
        json_field_instructions=kwargs.get("json_field_instructions", ""),
        sql_samples=kwargs.get("sql_samples", None),
        sql_functions=kwargs.get("sql_functions", None),
        document_context=kwargs.get("document_context", None),
    )["prompt"]


def test_prompt_without_document_context_omits_section():
    """When no documents are selected, the new section must not appear."""
    prompt = _render()
    assert "USER-SELECTED DOCUMENT CONTEXT" not in prompt
    assert "[" not in prompt or "hal." not in prompt  # no leftover citation hint
    # Existing behavior preserved
    assert "ANALYTICAL QUESTION" in prompt
    assert "show revenue" in prompt


def test_prompt_with_empty_document_context_omits_section():
    """An empty list must behave the same as None (Jinja {% if %} truthiness)."""
    prompt = _render(document_context=[])
    assert "USER-SELECTED DOCUMENT CONTEXT" not in prompt


def test_prompt_with_document_context_renders_section():
    chunks = [
        {
            "document_id": "doc-1",
            "filename": "Strategy 2025.pdf",
            "page": 5,
            "chunk_index": 0,
            "text": "Revenue target for Q3 2025 is 10 billion IDR.",
            "score": 0.91,
        },
        {
            "document_id": "doc-1",
            "filename": "Strategy 2025.pdf",
            "page": 7,
            "chunk_index": 0,
            "text": "Customer acquisition goal: 50 new enterprise clients.",
            "score": 0.83,
        },
    ]
    prompt = _render(document_context=chunks)

    # New section header present
    assert "### USER-SELECTED DOCUMENT CONTEXT ###" in prompt
    # Citation format spelled out
    assert "[Strategy 2025.pdf, hal. 5]" in prompt
    assert "[Strategy 2025.pdf, hal. 7]" in prompt
    # Chunk text included
    assert "Revenue target for Q3 2025" in prompt
    assert "Customer acquisition goal" in prompt
    # Citation guidance is given to the LLM
    assert "[filename, hal. PAGE]" in prompt


def test_prompt_with_document_context_and_instructions():
    """Both sections should coexist without interfering."""
    prompt = _render(
        instructions=[{"instruction": "Always limit to 100 rows"}],
        document_context=[
            {
                "document_id": "d",
                "filename": "policy.pdf",
                "page": 2,
                "chunk_index": 0,
                "text": "Quarterly review policy mandates quarterly aggregation.",
                "score": 0.7,
            }
        ],
    )
    assert "USER INSTRUCTIONS" in prompt
    assert "USER-SELECTED DOCUMENT CONTEXT" in prompt
    # Order: instructions BEFORE doc context (per template)
    assert prompt.index("USER INSTRUCTIONS") < prompt.index(
        "USER-SELECTED DOCUMENT CONTEXT"
    )
    # And doc context BEFORE the question
    assert prompt.index("USER-SELECTED DOCUMENT CONTEXT") < prompt.index(
        "ANALYTICAL QUESTION"
    )


def test_prompt_chunk_separator_present():
    """Each chunk should be followed by --- separator."""
    chunks = [
        {
            "document_id": "d",
            "filename": "a.pdf",
            "page": 1,
            "chunk_index": 0,
            "text": "First chunk text.",
            "score": 0.9,
        },
        {
            "document_id": "d",
            "filename": "a.pdf",
            "page": 2,
            "chunk_index": 0,
            "text": "Second chunk text.",
            "score": 0.8,
        },
    ]
    prompt = _render(document_context=chunks)
    # Two separators expected
    assert prompt.count("---") >= 2
