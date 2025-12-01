from __future__ import annotations

from dataclasses import dataclass
from typing import Dict

from src.config import Settings
from src.core.pipeline import PipelineComponent
from src.pipelines import generation, indexing, retrieval
from src.utils import fetch_analytics_docs
from src.web.v1 import services


@dataclass
class ServiceContainerBuilder:
    settings: Settings
    pipe_components: Dict[str, PipelineComponent]

    def with_settings(self, settings: Settings) -> ServiceContainerBuilder:
        self.settings = settings
        return self

    def with_components(
        self, pipe_components: Dict[str, PipelineComponent]
    ) -> ServiceContainerBuilder:
        self.pipe_components = pipe_components
        return self

    def build(self) -> services.ServiceContainer:
        # Validate minimal required components to catch config errors early
        self._validate()

        shared = self._create_shared_pipelines()
        return self._create_services(shared)

    def _validate(self) -> None:
        required_keys = [
            # retrieval/indexing/generation used across services
            "db_schema_retrieval",
            "sql_pairs_indexing",
            "instructions_indexing",
            "sql_pairs_retrieval",
            "instructions_retrieval",
            "sql_correction",
            "sql_functions_retrieval",
            "sql_executor",
            # ask pipelines
            "intent_classification",
            "misleading_assistance",
            "data_assistance",
            "user_guide_assistance",
            "historical_question_retrieval",
            "sql_generation",
            "sql_generation_reasoning",
            "followup_sql_generation_reasoning",
            "followup_sql_generation",
            # other services
            "semantics_description",
            "db_schema_indexing",
            "historical_question_indexing",
            "table_description_indexing",
            "project_meta_indexing",
            "sql_regeneration",
            "chart_generation",
            "preprocess_sql_data",
            "sql_answer",
            "relationship_recommendation",
            "question_recommendation",
            "question_recommendation_sql_generation",
            "sql_question_generation",
            "sql_tables_extraction",
        ]
        missing = [k for k in required_keys if k not in (self.pipe_components or {})]
        if missing:
            raise KeyError(f"Missing pipeline component(s): {', '.join(missing)}")

    def _create_shared_pipelines(self) -> Dict[str, object]:
        s = self.settings
        pc = self.pipe_components

        _db_schema_retrieval_pipeline = retrieval.DbSchemaRetrieval(
            **pc["db_schema_retrieval"],
            table_retrieval_size=s.table_retrieval_size,
            table_column_retrieval_size=s.table_column_retrieval_size,
        )
        _sql_pair_indexing_pipeline = indexing.SqlPairs(
            **pc["sql_pairs_indexing"],
            sql_pairs_path=s.sql_pairs_path,
        )
        _instructions_indexing_pipeline = indexing.Instructions(
            **pc["instructions_indexing"],
        )
        _sql_pair_retrieval_pipeline = retrieval.SqlPairsRetrieval(
            **pc["sql_pairs_retrieval"],
            sql_pairs_similarity_threshold=s.sql_pairs_similarity_threshold,
            sql_pairs_retrieval_max_size=s.sql_pairs_retrieval_max_size,
        )
        _instructions_retrieval_pipeline = retrieval.Instructions(
            **pc["instructions_retrieval"],
            similarity_threshold=s.instructions_similarity_threshold,
            top_k=s.instructions_top_k,
        )
        _sql_correction_pipeline = generation.SQLCorrection(
            **pc["sql_correction"],
        )
        _sql_functions_retrieval_pipeline = retrieval.SqlFunctions(
            **pc["sql_functions_retrieval"],
        )
        _sql_executor_pipeline = retrieval.SQLExecutor(
            **pc["sql_executor"],
        )

        return {
            "db_schema_retrieval": _db_schema_retrieval_pipeline,
            "sql_pairs_indexing": _sql_pair_indexing_pipeline,
            "instructions_indexing": _instructions_indexing_pipeline,
            "sql_pairs_retrieval": _sql_pair_retrieval_pipeline,
            "instructions_retrieval": _instructions_retrieval_pipeline,
            "sql_correction": _sql_correction_pipeline,
            "sql_functions_retrieval": _sql_functions_retrieval_pipeline,
            "sql_executor": _sql_executor_pipeline,
        }

    def _create_services(self, shared: Dict[str, object]) -> services.ServiceContainer:
        from src.globals import ServiceContainer  # type: ignore

        pc = self.pipe_components
        s = self.settings
        query_cache = {"maxsize": s.query_cache_maxsize, "ttl": s.query_cache_ttl}
        analytics_docs = fetch_analytics_docs(s.doc_endpoint, s.is_oss)

        return ServiceContainer(
            semantics_description=services.SemanticsDescription(
                pipelines={
                    "semantics_description": generation.SemanticsDescription(
                        **pc["semantics_description"],
                    )
                },
                **query_cache,
            ),
            semantics_preparation_service=services.SemanticsPreparationService(
                pipelines={
                    "db_schema": indexing.DBSchema(
                        **pc["db_schema_indexing"],
                        column_batch_size=s.column_indexing_batch_size,
                    ),
                    "historical_question": indexing.HistoricalQuestion(
                        **pc["historical_question_indexing"],
                    ),
                    "table_description": indexing.TableDescription(
                        **pc["table_description_indexing"],
                    ),
                    "sql_pairs": shared["sql_pairs_indexing"],
                    "instructions": shared["instructions_indexing"],
                    "project_meta": indexing.ProjectMeta(
                        **pc["project_meta_indexing"],
                    ),
                },
                **query_cache,
            ),
            ask_service=services.AskService(
                pipelines={
                    "intent_classification": generation.IntentClassification(
                        **pc["intent_classification"],
                        analytics_docs=analytics_docs,
                    ),
                    "misleading_assistance": generation.MisleadingAssistance(
                        **pc["misleading_assistance"],
                    ),
                    "data_assistance": generation.DataAssistance(
                        **pc["data_assistance"]
                    ),
                    "user_guide_assistance": generation.UserGuideAssistance(
                        **pc["user_guide_assistance"],
                        analytics_docs=analytics_docs,
                    ),
                    "db_schema_retrieval": shared["db_schema_retrieval"],
                    "historical_question": retrieval.HistoricalQuestionRetrieval(
                        **pc["historical_question_retrieval"],
                        historical_question_retrieval_similarity_threshold=s.historical_question_retrieval_similarity_threshold,
                    ),
                    "sql_pairs_retrieval": shared["sql_pairs_retrieval"],
                    "instructions_retrieval": shared["instructions_retrieval"],
                    "sql_generation": generation.SQLGeneration(
                        **pc["sql_generation"],
                    ),
                    "sql_generation_reasoning": generation.SQLGenerationReasoning(
                        **pc["sql_generation_reasoning"],
                    ),
                    "followup_sql_generation_reasoning": generation.FollowUpSQLGenerationReasoning(
                        **pc["followup_sql_generation_reasoning"],
                    ),
                    "sql_correction": shared["sql_correction"],
                    "followup_sql_generation": generation.FollowUpSQLGeneration(
                        **pc["followup_sql_generation"],
                    ),
                    "sql_functions_retrieval": shared["sql_functions_retrieval"],
                },
                allow_intent_classification=s.allow_intent_classification,
                allow_sql_generation_reasoning=s.allow_sql_generation_reasoning,
                allow_sql_functions_retrieval=s.allow_sql_functions_retrieval,
                max_histories=s.max_histories,
                enable_column_pruning=s.enable_column_pruning,
                max_sql_correction_retries=s.max_sql_correction_retries,
                **query_cache,
            ),
            ask_feedback_service=services.AskFeedbackService(
                pipelines={
                    "db_schema_retrieval": shared["db_schema_retrieval"],
                    "sql_pairs_retrieval": shared["sql_pairs_retrieval"],
                    "instructions_retrieval": shared["instructions_retrieval"],
                    "sql_functions_retrieval": shared["sql_functions_retrieval"],
                    "sql_regeneration": generation.SQLRegeneration(
                        **pc["sql_regeneration"],
                    ),
                    "sql_correction": shared["sql_correction"],
                },
                allow_sql_functions_retrieval=s.allow_sql_functions_retrieval,
                **query_cache,
            ),
            chart_service=services.ChartService(
                pipelines={
                    "sql_executor": shared["sql_executor"],
                    "chart_generation": generation.ChartGeneration(
                        **pc["chart_generation"],
                    ),
                },
                **query_cache,
            ),
            chart_adjustment_service=services.ChartAdjustmentService(
                pipelines={
                    "sql_executor": shared["sql_executor"],
                    "chart_adjustment": generation.ChartAdjustment(
                        **pc["chart_adjustment"],
                    ),
                },
                **query_cache,
            ),
            sql_answer_service=services.SqlAnswerService(
                pipelines={
                    "preprocess_sql_data": retrieval.PreprocessSqlData(
                        **pc["preprocess_sql_data"],
                    ),
                    "sql_answer": generation.SQLAnswer(
                        **pc["sql_answer"],
                    ),
                },
                **query_cache,
            ),
            relationship_recommendation=services.RelationshipRecommendation(
                pipelines={
                    "relationship_recommendation": generation.RelationshipRecommendation(
                        **pc["relationship_recommendation"],
                    )
                },
                **query_cache,
            ),
            question_recommendation=services.QuestionRecommendation(
                pipelines={
                    "question_recommendation": generation.QuestionRecommendation(
                        **pc["question_recommendation"],
                    ),
                    "db_schema_retrieval": shared["db_schema_retrieval"],
                    "sql_generation": generation.SQLGeneration(
                        **pc["question_recommendation_sql_generation"],
                    ),
                    "sql_pairs_retrieval": shared["sql_pairs_retrieval"],
                    "instructions_retrieval": shared["instructions_retrieval"],
                    "sql_functions_retrieval": shared["sql_functions_retrieval"],
                },
                allow_sql_functions_retrieval=s.allow_sql_functions_retrieval,
                **query_cache,
            ),
            sql_pairs_service=services.SqlPairsService(
                pipelines={
                    "sql_pairs": shared["sql_pairs_indexing"],
                },
                **query_cache,
            ),
            sql_question_service=services.SqlQuestionService(
                pipelines={
                    "sql_question_generation": generation.SQLQuestion(
                        **pc["sql_question_generation"],
                    )
                },
                **query_cache,
            ),
            instructions_service=services.InstructionsService(
                pipelines={
                    "instructions_indexing": shared["instructions_indexing"],
                },
                **query_cache,
            ),
            sql_correction_service=services.SqlCorrectionService(
                pipelines={
                    "sql_tables_extraction": generation.SQLTablesExtraction(
                        **pc["sql_tables_extraction"],
                    ),
                    "db_schema_retrieval": shared["db_schema_retrieval"],
                    "sql_correction": shared["sql_correction"],
                },
                **query_cache,
            ),
        )
