import asyncio
import logging
from dataclasses import dataclass
from typing import Dict, Literal, Optional

from cachetools import TTLCache
from langfuse.decorators import observe
from pydantic import BaseModel

from src.core.pipeline import BasicPipeline
from src.utils import trace_metadata
from src.web.v1.services import BaseRequest

logger = logging.getLogger("analytics-service")


@dataclass
class SqlQuestionContext:
    """Context for SQL question operations"""

    query_id: str
    project_id: str
    request_from: Literal["ui", "api"]
    trace_id: Optional[str] = None


# POST /v1/sql-questions
class SqlQuestionRequest(BaseRequest):
    """Request model for SQL question generation"""

    sqls: list[str]


class SqlQuestionResponse(BaseModel):
    """Response model for SQL question generation"""

    query_id: str


# GET /v1/sql-questions/{query_id}
class SqlQuestionResultRequest(BaseModel):
    """Request model for getting SQL question result"""

    query_id: str


class SqlQuestionResultResponse(BaseModel):
    """Response model for SQL question result"""

    class SqlQuestionError(BaseModel):
        """Error model for SQL question operations"""

        code: Literal["OTHERS"]
        message: str

    status: Literal["generating", "succeeded", "failed"]
    error: Optional[SqlQuestionError] = None
    questions: Optional[list[str]] = None
    trace_id: Optional[str] = None


class SqlQuestionService:
    def __init__(
        self,
        pipelines: Dict[str, BasicPipeline],
        maxsize: int = 1_000_000,
        ttl: int = 120,
    ):
        self._pipelines = pipelines
        self._sql_question_results: Dict[str, SqlQuestionResultResponse] = TTLCache(
            maxsize=maxsize, ttl=ttl
        )

    def _generate_sql_questions(
        self, sqls: list[str], configurations: dict
    ) -> list[str]:
        """Generate SQL questions from SQLs"""
        try:
            tasks = [
                self._pipelines["sql_question_generation"].run(
                    sql=sql,
                    configuration=configurations,
                )
                for sql in sqls
            ]
            return tasks
        except Exception as e:
            logger.error(f"Error generating SQL questions: {e}")
            raise

    def _update_status(
        self,
        query_id: str,
        status: Literal["generating", "succeeded", "failed"],
        questions: Optional[list[str]] = None,
        error: Optional[SqlQuestionResultResponse.SqlQuestionError] = None,
        trace_id: Optional[str] = None,
    ) -> None:
        """Update SQL question result status"""
        try:
            self._sql_question_results[query_id] = SqlQuestionResultResponse(
                status=status,
                questions=questions,
                error=error,
                trace_id=trace_id,
            )
        except Exception as e:
            logger.error(f"Error updating status for {query_id}: {e}")

    @observe(name="SQL Question")
    @trace_metadata
    async def sql_question(
        self,
        sql_question_request: SqlQuestionRequest,
        **kwargs,
    ):
        """Generate SQL questions - clean implementation"""
        trace_id = kwargs.get("trace_id")

        # Create context
        context = SqlQuestionContext(
            query_id=sql_question_request.query_id,
            project_id=sql_question_request.project_id,
            request_from=sql_question_request.request_from,
            trace_id=trace_id,
        )

        results = {
            "sql_question_result": {},
            "metadata": {
                "error_type": "",
                "error_message": "",
            },
            "request_from": context.request_from,
        }

        try:
            # Update status to generating
            self._update_status(
                context.query_id, "generating", trace_id=context.trace_id
            )

            # Generate SQL questions
            tasks = self._generate_sql_questions(
                sql_question_request.sqls, sql_question_request.configurations
            )
            sql_questions_results = await asyncio.gather(*tasks)
            sql_questions = [res["post_process"] for res in sql_questions_results]

            # Update status to succeeded
            self._update_status(
                context.query_id,
                "succeeded",
                questions=sql_questions,
                trace_id=context.trace_id,
            )

            results["sql_question_result"] = sql_questions
            return results

        except Exception as e:
            logger.error(f"SQL question pipeline failed: {e}")

            # Update status to failed
            self._update_status(
                context.query_id,
                "failed",
                error=SqlQuestionResultResponse.SqlQuestionError(
                    code="OTHERS",
                    message=str(e),
                ),
                trace_id=context.trace_id,
            )

            results["metadata"]["error_type"] = "OTHERS"
            results["metadata"]["error_message"] = str(e)
            return results

    def get_sql_question_result(
        self,
        sql_question_result_request: SqlQuestionResultRequest,
    ) -> SqlQuestionResultResponse:
        """Get SQL question result with error handling"""
        try:
            result = self._sql_question_results.get(
                sql_question_result_request.query_id
            )
            if result is None:
                logger.warning(
                    f"SQL question result not found: {sql_question_result_request.query_id}"
                )
                return SqlQuestionResultResponse(
                    status="failed",
                    error=SqlQuestionResultResponse.SqlQuestionError(
                        code="OTHERS",
                        message=f"{sql_question_result_request.query_id} is not found",
                    ),
                )
            return result
        except Exception as e:
            logger.error(f"Error getting SQL question result: {e}")
            return SqlQuestionResultResponse(
                status="failed",
                error=SqlQuestionResultResponse.SqlQuestionError(
                    code="OTHERS",
                    message=str(e),
                ),
            )
