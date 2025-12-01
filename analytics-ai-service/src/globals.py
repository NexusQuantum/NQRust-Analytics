import logging
from dataclasses import asdict, dataclass

import toml

from src.config import Settings
from src.core.builder import ServiceContainerBuilder
from src.core.pipeline import PipelineComponent
from src.core.provider import EmbedderProvider, LLMProvider
from src.web.v1 import services

logger = logging.getLogger("analytics-service")


@dataclass
class ServiceContainer:
    ask_service: services.AskService
    ask_feedback_service: services.AskFeedbackService
    question_recommendation: services.QuestionRecommendation
    relationship_recommendation: services.RelationshipRecommendation
    semantics_description: services.SemanticsDescription
    semantics_preparation_service: services.SemanticsPreparationService
    chart_service: services.ChartService
    chart_adjustment_service: services.ChartAdjustmentService
    sql_answer_service: services.SqlAnswerService
    sql_pairs_service: services.SqlPairsService
    sql_question_service: services.SqlQuestionService
    instructions_service: services.InstructionsService
    sql_correction_service: services.SqlCorrectionService


@dataclass
class ServiceMetadata:
    pipes_metadata: dict
    service_version: str


def create_service_container(
    pipe_components: dict[str, PipelineComponent],
    settings: Settings,
) -> ServiceContainer:
    return ServiceContainerBuilder(
        settings=settings, pipe_components=pipe_components
    ).build()


# Create a dependency that will be used to access the ServiceContainer
def get_service_container():
    from src.__main__ import app

    return app.state.service_container


def create_service_metadata(
    pipe_components: dict[str, PipelineComponent],
    pyproject_path: str = "pyproject.toml",
) -> ServiceMetadata:
    """
    This service metadata is used for logging purposes and will be sent to Langfuse.
    """

    def _get_version_from_pyproject() -> str:
        with open(pyproject_path, "r") as f:
            pyproject = toml.load(f)
            return pyproject["tool"]["poetry"]["version"]

    def _convert_pipe_metadata(
        llm_provider: LLMProvider,
        embedder_provider: EmbedderProvider,
        **_,
    ) -> dict:
        llm_metadata = (
            {
                "llm_model": llm_provider.get_model(),
                "llm_model_kwargs": llm_provider.get_model_kwargs(),
            }
            if llm_provider
            else {}
        )

        embedding_metadata = (
            {
                "embedding_model": embedder_provider.get_model(),
            }
            if embedder_provider
            else {}
        )
        return {**llm_metadata, **embedding_metadata}

    pipes_metadata = {
        pipe_name: _convert_pipe_metadata(**asdict(component))
        for pipe_name, component in pipe_components.items()
    }

    service_version = _get_version_from_pyproject()

    logger.info(f"Service version: {service_version}")

    return ServiceMetadata(pipes_metadata, service_version)


# Create a dependency that will be used to access the ServiceMetadata
def get_service_metadata():
    from src.__main__ import app

    return app.state.service_metadata
