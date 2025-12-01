from abc import ABCMeta, abstractmethod
from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Dict, Generic, Optional, TypeVar

from hamilton.async_driver import AsyncDriver
from hamilton.driver import Driver
from haystack import Pipeline
from pydantic import BaseModel, Field

from src.core.engine import Engine
from src.core.provider import DocumentStoreProvider, EmbedderProvider, LLMProvider


class BasicPipeline(metaclass=ABCMeta):
    def __init__(self, pipe: Pipeline | AsyncDriver | Driver):
        self._pipe = pipe

    @abstractmethod
    def run(self, *args, **kwargs) -> Dict[str, Any]:
        ...


@dataclass
class PipelineComponent(Mapping):
    llm_provider: LLMProvider = None
    embedder_provider: EmbedderProvider = None
    document_store_provider: DocumentStoreProvider = None
    engine: Engine = None

    def __getitem__(self, key):
        return getattr(self, key)

    def __iter__(self):
        return iter(self.__dict__)

    def __len__(self):
        return len(self.__dict__)


# Typed pipeline primitives (non-breaking additions)
TInput = TypeVar("TInput")
TOutput = TypeVar("TOutput")


class PipelineResult(BaseModel, Generic[TOutput]):
    """
    Standard wrapper for pipeline results to improve type-safety and ergonomics.

    This is additive and does not change existing pipelines; future pipelines
    can return PipelineResult for structured outcomes without affecting
    current behavior.
    """

    success: bool = Field(default=True)
    data: Optional[TOutput] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class EnhancedBasicPipeline(BasicPipeline, Generic[TInput, TOutput]):
    """
    New optional base class for typed pipelines. Existing pipelines can
    continue extending BasicPipeline. When migrating, prefer this class
    to get input validation hooks and typed results.
    """

    # Optional Pydantic models for validating inputs/outputs when pipelines adopt them
    input_model: Optional[type[BaseModel]] = None
    output_model: Optional[type[BaseModel]] = None

    def __init__(self, pipe: Pipeline | AsyncDriver | Driver):
        super().__init__(pipe)

    def validate_input(self, *_args: Any, **_kwargs: Any) -> None:
        """Hook: override to validate/normalize inputs before execution."""

    @abstractmethod
    async def _execute(self, *args: Any, **kwargs: Any) -> TOutput:
        ...

    async def run(self, *args: Any, **kwargs: Any) -> PipelineResult[TOutput]:
        self.validate_input(*args, **kwargs)
        data = await self._execute(*args, **kwargs)
        return PipelineResult[TOutput](success=True, data=data)
