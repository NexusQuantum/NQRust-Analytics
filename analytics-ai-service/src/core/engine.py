import logging
import re
from abc import ABCMeta, abstractmethod
from typing import Any, Dict, Optional, Tuple

import aiohttp
import sqlglot
from pydantic import BaseModel

logger = logging.getLogger("analytics-service")


class EngineConfig(BaseModel):
    provider: str = "analytics_ui"
    config: dict = {}


class Engine(metaclass=ABCMeta):
    @abstractmethod
    async def execute_sql(
        self,
        sql: str,
        session: aiohttp.ClientSession,
        dry_run: bool = True,
        **kwargs,
    ) -> Tuple[bool, Optional[Dict[str, Any]]]:
        ...


def clean_generation_result(result: str) -> str:
    def _normalize_whitespace(s: str) -> str:
        return re.sub(r"\s+", " ", s).strip()

    return (
        _normalize_whitespace(result)
        .replace("```sql", "")
        .replace("```json", "")
        .replace('"""', "")
        .replace("'''", "")
        .replace("```", "")
        .replace(";", "")
    )


def remove_limit_statement(sql: str) -> str:
    pattern = r"\s*LIMIT\s+\d+(\s*;?\s*--.*|\s*;?\s*)$"
    modified_sql = re.sub(pattern, "", sql, flags=re.IGNORECASE)

    return modified_sql


def add_quotes(sql: str) -> Tuple[str, str]:
    sql = sql.replace("`", '"')
    # LLM generates PostgreSQL-flavored SQL (CTEs, to_char, etc). Tell sqlglot
    # the input dialect so it parses idiomatic PG correctly; fall back to
    # generic auto-detect if PG parse fails for any reason.
    for read_dialect in ("postgres", None):
        try:
            quoted_sql = sqlglot.transpile(
                sql,
                read=read_dialect,
                identify=True,
                error_level=sqlglot.ErrorLevel.RAISE,
                unsupported_level=sqlglot.ErrorLevel.RAISE,
            )[0]
            return quoted_sql, ""
        except Exception as e:
            last_error = e
            continue

    logger.exception(f"Error in sqlglot.transpile to {sql}: {last_error}")
    return "", str(last_error)
