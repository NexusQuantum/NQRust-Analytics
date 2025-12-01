# 🔧 Analytics AI Service - Refactoring Proposal

**Document Version**: 1.0  
**Date**: October 3, 2025  
**Status**: 📋 Proposed  
**Owner**: Development Team

---

## 📋 Table of Contents

- [Executive Summary](#executive-summary)
- [Current State Analysis](#current-state-analysis)
- [Refactoring Goals](#refactoring-goals)
- [Priority 1: Critical Refactoring](#priority-1-critical-refactoring)
- [Priority 2: Important Improvements](#priority-2-important-improvements)
- [Implementation Timeline](#implementation-timeline)
- [Risk Assessment](#risk-assessment)
- [Success Criteria](#success-criteria)
- [Appendix](#appendix)

---

## 📊 Executive Summary

### Purpose
This document outlines a comprehensive refactoring plan for `analytics-ai-service` to improve code maintainability, testability, and extensibility **without changing any business logic or behavior**.

### Key Principles
1. ✅ **No Logic Changes**: All refactoring must preserve existing behavior
2. ✅ **Test-Driven**: Write/update tests before refactoring
3. ✅ **Incremental**: Small, reviewable changes
4. ✅ **Measurable**: Clear success metrics

### Impact Overview

| Metric | Before | After (Target) |
|--------|--------|----------------|
| Average Function Length | 150 lines | < 50 lines |
| Test Coverage | ~60% | > 80% |
| Code Duplication | ~15% | < 5% |
| Type Coverage | ~70% | > 95% |
| Cyclomatic Complexity | 25+ | < 10 |

---

## 🔍 Current State Analysis

### Code Quality Issues

#### 1. **God Objects** 🚨 Critical
**Location**: `src/web/v1/services/ask.py`

```python
# Current: 656 lines in single file
class AskService:
    async def ask(self, ask_request):
        # 600+ lines of logic
        # Multiple responsibilities:
        # - Historical question check
        # - Intent classification
        # - Context retrieval (3 pipelines)
        # - SQL generation
        # - SQL correction loop
        # - Error handling
        # - Response formatting
```

**Problems**:
- Hard to test individual components
- Difficult to understand flow
- High risk for regression
- Tight coupling

**Impact**: 🔴 High - This is the core service

---

#### 2. **Procedural Code in OOP** 🚨 Critical
**Location**: `src/globals.py`

```python
# Current: 255 lines of manual wiring
def create_service_container(pipe_components, settings):
    # Manual instantiation of 50+ objects
    _db_schema_retrieval_pipeline = retrieval.DbSchemaRetrieval(...)
    _sql_pair_indexing_pipeline = indexing.SqlPairs(...)
    # ... 40 more lines ...
    
    return ServiceContainer(
        semantics_description=services.SemanticsDescription(...),
        semantics_preparation_service=services.SemanticsPreparationService(...),
        # ... 10 more services ...
    )
```

**Problems**:
- Repetitive code
- Hard to extend (add new service = modify giant function)
- Difficult to test in isolation
- No clear dependency tree

**Impact**: 🟡 Medium - But blocks extensibility

---

#### 3. **Weak Abstractions** 🟠 Important
**Location**: `src/core/pipeline.py`

```python
# Current: Minimal interface
class BasicPipeline(metaclass=ABCMeta):
    def __init__(self, pipe: Pipeline | AsyncDriver | Driver):
        self._pipe = pipe

    @abstractmethod
    def run(self, *args, **kwargs) -> Dict[str, Any]:
        ...
```

**Problems**:
- No input validation contract
- No metadata or introspection
- Each pipeline implements differently
- Hard to debug

**Impact**: 🟡 Medium - Affects all pipelines

---

#### 4. **Inconsistent Error Handling** 🟠 Important

```python
# Pattern 1: Generic exception
try:
    result = await pipeline.run()
except Exception as e:
    logger.exception(f"Error: {e}")
    
# Pattern 2: String codes
if not documents:
    return AskError(code="NO_RELEVANT_DATA", message="...")
    
# Pattern 3: Silent fail
try:
    validate()
except:
    pass
```

**Problems**:
- Inconsistent error responses
- Hard to track error types
- Difficult to handle in UI

**Impact**: 🟢 Low - But affects UX

---

#### 5. **Configuration Scattered** 🟠 Important

```python
# config.yaml
settings:
  max_retries: 3

# .env.dev  
ANALYTICS_AI_SERVICE_PORT=5555

# Hardcoded
max_sql_correction_retries = 3
```

**Problems**:
- Hard to find settings
- No validation
- Magic numbers

**Impact**: 🟢 Low - But affects maintainability

---

#### 6. **Hardcoded Prompts** 🟢 Nice to Have

```python
# In sql_generation.py (line 28-80)
sql_generation_system_prompt = """
### TASK ###
You are a data analyst...
"""

# In intent_classification.py (line 50-120)
intent_prompt = """
### INSTRUCTIONS ###
...
"""
```

**Problems**:
- Hard to version prompts
- Difficult to A/B test
- No reusability

**Impact**: 🟢 Low - Future improvement

---

## 🎯 Refactoring Goals

### Primary Goals

1. **Improve Maintainability**
   - Reduce function length to < 50 lines
   - Decrease cyclomatic complexity to < 10
   - Eliminate code duplication

2. **Enhance Testability**
   - Increase test coverage from 60% to 80%
   - Enable unit testing of individual components
   - Mock external dependencies easily

3. **Increase Type Safety**
   - Add comprehensive type hints (95% coverage)
   - Enable mypy strict mode
   - Use Pydantic for validation

4. **Better Extensibility**
   - Make adding new services easy (< 10 lines)
   - Plugin architecture for pipelines
   - Clear extension points

### Non-Goals

❌ **Not in Scope**:
- Changing business logic
- Modifying API contracts (except adding optional fields)
- Performance optimization (unless critical)
- Adding new features
- Migrating to different frameworks

---

## 🚀 Priority 1: Critical Refactoring

### 1.1 Extract Methods from AskService

**Estimated Effort**: 3-4 days  
**Risk**: Medium  
**Impact**: High

#### Current State
```python
class AskService:
    async def ask(self, request):
        # 600+ lines of sequential logic
```

#### Target State
```python
class AskService:
    async def ask(self, request: AskRequest) -> dict:
        """Main orchestration method."""
        query_id = request.query_id
        
        # Check cache
        if cached := await self._check_historical_question(request):
            return self._format_cached_response(cached)
        
        # Classify intent
        intent = await self._classify_intent(request)
        if intent.is_general():
            return await self._handle_general_query(intent, request)
        
        # Generate SQL
        contexts = await self._retrieve_contexts(request)
        sql_result = await self._generate_sql(request, contexts)
        
        # Validate and correct
        if not sql_result.is_valid:
            sql_result = await self._correct_sql(sql_result, contexts)
        
        return self._format_response(sql_result)
    
    async def _check_historical_question(
        self, 
        request: AskRequest
    ) -> Optional[CachedResult]:
        """Check if question exists in cache."""
        # ~30 lines
    
    async def _classify_intent(
        self, 
        request: AskRequest
    ) -> IntentResult:
        """Classify user intent."""
        # ~40 lines
    
    async def _retrieve_contexts(
        self, 
        request: AskRequest
    ) -> RetrievalContexts:
        """Retrieve all necessary contexts in parallel."""
        # ~50 lines
    
    async def _generate_sql(
        self,
        request: AskRequest,
        contexts: RetrievalContexts,
    ) -> SQLGenerationResult:
        """Generate SQL from contexts."""
        # ~60 lines
    
    async def _correct_sql(
        self,
        invalid_result: SQLGenerationResult,
        contexts: RetrievalContexts,
    ) -> SQLGenerationResult:
        """Correct invalid SQL with feedback loop."""
        # ~40 lines
    
    async def _handle_general_query(
        self,
        intent: IntentResult,
        request: AskRequest,
    ) -> dict:
        """Handle non-SQL queries."""
        # ~30 lines
```

#### Benefits
- ✅ Each method < 60 lines
- ✅ Testable in isolation
- ✅ Clear responsibilities
- ✅ Reusable components
- ✅ Better error handling per step

#### Implementation Steps

**Step 1**: Add tests for current behavior
```bash
# Create comprehensive integration tests
tests/pytest/services/test_ask_service_integration.py
```

**Step 2**: Extract smallest method first
```python
# Start with simple extraction
def _format_response(self, sql_result) -> dict:
    return {...}
```

**Step 3**: Test extracted method
```python
def test_format_response_with_valid_sql():
    service = AskService(...)
    result = service._format_response(valid_sql_result)
    assert result["status"] == "finished"
```

**Step 4**: Repeat for each method

**Step 5**: Update main `ask()` method to use extracted methods

**Step 6**: Verify integration tests still pass

#### Rollback Plan
- Keep original method as `_ask_legacy()`
- Feature flag to switch between implementations
- If issues, revert to legacy

---

### 1.2 Implement Builder Pattern for ServiceContainer

**Estimated Effort**: 2-3 days  
**Risk**: Low  
**Impact**: Medium

#### Current State
```python
def create_service_container(pipe_components, settings):
    # 255 lines of repetitive instantiation
    return ServiceContainer(...)
```

#### Target State
```python
class ServiceContainerBuilder:
    """Builder for creating service container with dependencies."""
    
    def __init__(self):
        self._components = {}
        self._settings = None
        self._pipelines = {}
    
    def with_components(
        self, 
        components: Dict[str, PipelineComponent]
    ) -> 'ServiceContainerBuilder':
        """Add pipeline components."""
        self._components = components
        return self
    
    def with_settings(
        self, 
        settings: Settings
    ) -> 'ServiceContainerBuilder':
        """Add configuration settings."""
        self._settings = settings
        return self
    
    def build(self) -> ServiceContainer:
        """Build the service container."""
        self._validate()
        self._create_shared_pipelines()
        self._create_services()
        return ServiceContainer(**self._services)
    
    def _validate(self) -> None:
        """Validate all dependencies are present."""
        if not self._components:
            raise ValueError("Components required")
        if not self._settings:
            raise ValueError("Settings required")
    
    def _create_shared_pipelines(self) -> None:
        """Create pipelines used by multiple services."""
        self._pipelines["db_schema_retrieval"] = retrieval.DbSchemaRetrieval(
            **self._components["db_schema_retrieval"],
            table_retrieval_size=self._settings.table_retrieval_size,
        )
        # ... other shared pipelines
    
    def _create_services(self) -> None:
        """Create all services."""
        self._services = {
            "ask_service": self._create_ask_service(),
            "chart_service": self._create_chart_service(),
            # ... other services
        }
    
    def _create_ask_service(self) -> services.AskService:
        """Create AskService with dependencies."""
        return services.AskService(
            pipelines={
                "db_schema_retrieval": self._pipelines["db_schema_retrieval"],
                "sql_generation": generation.SQLGeneration(
                    **self._components["sql_generation"]
                ),
                # ... other pipelines
            },
            max_sql_correction_retries=self._settings.max_sql_correction_retries,
            **self._cache_config,
        )


# Usage
def create_service_container(components, settings):
    return (
        ServiceContainerBuilder()
        .with_components(components)
        .with_settings(settings)
        .build()
    )
```

#### Benefits
- ✅ Clear separation of concerns
- ✅ Easy to test individual services
- ✅ Fluent API
- ✅ Extensible (add new service = add one method)

#### Implementation Steps

1. Create `ServiceContainerBuilder` class
2. Migrate one service at a time
3. Update tests
4. Replace old function

---

### 1.3 Strengthen Pipeline Abstraction

**Estimated Effort**: 2-3 days  
**Risk**: Medium  
**Impact**: High

#### Current State
```python
class BasicPipeline(metaclass=ABCMeta):
    @abstractmethod
    def run(self, *args, **kwargs) -> Dict[str, Any]:
        ...
```

#### Target State
```python
from pydantic import BaseModel, ValidationError
from typing import TypeVar, Generic

TInput = TypeVar('TInput', bound=BaseModel)
TOutput = TypeVar('TOutput', bound=BaseModel)

class PipelineResult(BaseModel, Generic[TOutput]):
    """Standard pipeline result wrapper."""
    success: bool
    data: Optional[TOutput] = None
    error: Optional[str] = None
    metadata: Dict[str, Any] = {}

class BasicPipeline(ABC, Generic[TInput, TOutput]):
    """
    Base class for all pipelines.
    
    Provides:
    - Input validation
    - Output validation  
    - Metadata tracking
    - Error handling
    """
    
    def __init__(self):
        self._metadata = {
            "pipeline_name": self.__class__.__name__,
            "created_at": datetime.now(),
        }
    
    @abstractmethod
    async def _execute(self, input_data: TInput) -> TOutput:
        """
        Execute pipeline logic.
        
        Subclasses implement this method.
        """
        pass
    
    async def run(self, **kwargs) -> PipelineResult[TOutput]:
        """
        Run pipeline with validation and error handling.
        
        This method should not be overridden.
        """
        try:
            # Validate input
            input_data = self.input_model(**kwargs)
            
            # Execute
            start_time = time.time()
            output = await self._execute(input_data)
            duration = time.time() - start_time
            
            # Validate output
            validated_output = self.output_model(**output)
            
            return PipelineResult(
                success=True,
                data=validated_output,
                metadata={
                    **self._metadata,
                    "duration": duration,
                }
            )
        except ValidationError as e:
            logger.error(f"Validation error in {self.__class__.__name__}: {e}")
            return PipelineResult(
                success=False,
                error=str(e),
                metadata=self._metadata,
            )
        except Exception as e:
            logger.exception(f"Error in {self.__class__.__name__}: {e}")
            return PipelineResult(
                success=False,
                error=str(e),
                metadata=self._metadata,
            )
    
    @property
    @abstractmethod
    def input_model(self) -> Type[TInput]:
        """Pydantic model for input validation."""
        pass
    
    @property
    @abstractmethod
    def output_model(self) -> Type[TOutput]:
        """Pydantic model for output validation."""
        pass
    
    def get_metadata(self) -> dict:
        """Get pipeline metadata."""
        return self._metadata


# Example usage
class SQLGenerationInput(BaseModel):
    query: str
    contexts: List[str]
    sql_samples: List[dict] = []

class SQLGenerationOutput(BaseModel):
    sql: str
    reasoning: Optional[str] = None

class SQLGeneration(BasicPipeline[SQLGenerationInput, SQLGenerationOutput]):
    
    @property
    def input_model(self):
        return SQLGenerationInput
    
    @property
    def output_model(self):
        return SQLGenerationOutput
    
    async def _execute(self, input_data: SQLGenerationInput) -> dict:
        # Actual logic here
        return {"sql": "SELECT ...", "reasoning": "..."}
```

#### Benefits
- ✅ Type safety with generics
- ✅ Automatic validation
- ✅ Consistent error handling
- ✅ Better debugging with metadata
- ✅ Clear contracts

#### Migration Strategy

**Phase 1**: Create new base class (parallel to old)
**Phase 2**: Migrate generation pipelines (highest value)
**Phase 3**: Migrate retrieval pipelines
**Phase 4**: Migrate indexing pipelines
**Phase 5**: Remove old base class

---

## 📈 Priority 2: Important Improvements

### 2.1 Custom Exception Hierarchy

**Estimated Effort**: 1-2 days  
**Risk**: Low  
**Impact**: Medium

#### Implementation

```python
# src/core/exceptions.py

class AnalyticsAIException(Exception):
    """Base exception for all Analytics AI errors."""
    
    def __init__(self, message: str, code: str = None, details: dict = None):
        self.message = message
        self.code = code or self.__class__.__name__
        self.details = details or {}
        super().__init__(self.message)
    
    def to_dict(self) -> dict:
        return {
            "code": self.code,
            "message": self.message,
            "details": self.details,
        }


# Pipeline exceptions
class PipelineException(AnalyticsAIException):
    """Base for pipeline errors."""
    pass

class ValidationException(PipelineException):
    """Input/output validation failed."""
    code = "VALIDATION_ERROR"

class TimeoutException(PipelineException):
    """Pipeline execution timeout."""
    code = "TIMEOUT"


# Retrieval exceptions
class RetrievalException(AnalyticsAIException):
    """Base for retrieval errors."""
    pass

class NoRelevantDataException(RetrievalException):
    """No relevant data found for query."""
    code = "NO_RELEVANT_DATA"

class NoRelevantSQLException(RetrievalException):
    """No relevant SQL samples found."""
    code = "NO_RELEVANT_SQL"


# Generation exceptions
class GenerationException(AnalyticsAIException):
    """Base for generation errors."""
    pass

class LLMException(GenerationException):
    """LLM call failed."""
    code = "LLM_ERROR"

class SQLSyntaxException(GenerationException):
    """Generated SQL has syntax error."""
    code = "SQL_SYNTAX_ERROR"


# Provider exceptions
class ProviderException(AnalyticsAIException):
    """Base for provider errors."""
    pass

class LLMProviderException(ProviderException):
    """LLM provider error."""
    code = "LLM_PROVIDER_ERROR"

class DocumentStoreException(ProviderException):
    """Document store error."""
    code = "DOCUMENT_STORE_ERROR"


# Exception handler
@app.exception_handler(AnalyticsAIException)
async def analytics_exception_handler(request: Request, exc: AnalyticsAIException):
    return ORJSONResponse(
        status_code=400 if isinstance(exc, ValidationException) else 500,
        content={
            "error": exc.to_dict(),
            "request_id": request.state.request_id,
        },
    )
```

#### Benefits
- ✅ Consistent error handling
- ✅ Better client error messages
- ✅ Easier to catch specific errors
- ✅ Trackable error codes

---

### 2.2 Centralized Configuration

**Estimated Effort**: 2 days  
**Risk**: Low  
**Impact**: Medium

#### Implementation

```python
# src/config.py (enhanced)

from pydantic import BaseSettings, Field, validator
from typing import Optional

class CacheConfig(BaseModel):
    """Cache configuration."""
    maxsize: int = Field(1_000_000, gt=0)
    ttl: int = Field(3600, gt=0, le=86400, description="TTL in seconds")

class PipelineConfig(BaseModel):
    """Pipeline-specific configuration."""
    max_retries: int = Field(3, ge=1, le=10)
    timeout: float = Field(30.0, gt=0, le=300)
    enable_column_pruning: bool = False
    
class RetrievalConfig(BaseModel):
    """Retrieval configuration."""
    table_retrieval_size: int = Field(10, ge=1, le=100)
    table_column_retrieval_size: int = Field(100, ge=1, le=1000)
    column_indexing_batch_size: int = Field(50, ge=1, le=1000)
    
    # Similarity thresholds
    historical_question_similarity_threshold: float = Field(0.9, ge=0, le=1)
    sql_pairs_similarity_threshold: float = Field(0.7, ge=0, le=1)
    instructions_similarity_threshold: float = Field(0.7, ge=0, le=1)

class GenerationConfig(BaseModel):
    """Generation configuration."""
    allow_intent_classification: bool = True
    allow_sql_generation_reasoning: bool = True
    allow_sql_functions_retrieval: bool = True
    max_histories: int = Field(5, ge=0, le=20)

class Settings(BaseSettings):
    """Main application settings."""
    
    # Server config
    host: str = "127.0.0.1"
    port: int = Field(5555, ge=1024, le=65535)
    
    # Sub-configs
    cache: CacheConfig = CacheConfig()
    pipeline: PipelineConfig = PipelineConfig()
    retrieval: RetrievalConfig = RetrievalConfig()
    generation: GenerationConfig = GenerationConfig()
    
    @validator("port")
    def validate_port_not_used(cls, v):
        # Check if port is available
        return v
    
    class Config:
        env_file = ".env.dev"
        env_nested_delimiter = "__"

# Usage
settings = Settings()
print(settings.cache.ttl)
print(settings.pipeline.max_retries)
```

---

### 2.3 Extract Prompt Templates

**Estimated Effort**: 1 day  
**Risk**: Low  
**Impact**: Low

#### Structure

```
src/prompts/
├── __init__.py
├── sql_generation/
│   ├── system.jinja2
│   └── user.jinja2
├── intent_classification/
│   └── prompt.jinja2
├── sql_correction/
│   └── prompt.jinja2
└── templates.py  # Loader
```

#### Implementation

```python
# src/prompts/templates.py

from pathlib import Path
from jinja2 import Environment, FileSystemLoader
from functools import lru_cache

PROMPTS_DIR = Path(__file__).parent

class PromptManager:
    """Manages prompt templates."""
    
    def __init__(self, prompts_dir: Path = PROMPTS_DIR):
        self.env = Environment(
            loader=FileSystemLoader(prompts_dir),
            trim_blocks=True,
            lstrip_blocks=True,
        )
    
    @lru_cache(maxsize=100)
    def get_template(self, name: str):
        """Get cached template."""
        return self.env.get_template(name)
    
    def render(self, name: str, **kwargs) -> str:
        """Render template with variables."""
        template = self.get_template(name)
        return template.render(**kwargs)

# Usage
prompt_manager = PromptManager()
prompt = prompt_manager.render(
    "sql_generation/user.jinja2",
    query="What is the total revenue?",
    contexts=["..."],
)
```

---

## 📅 Implementation Timeline

### Week 1-2: Priority 1.1 (AskService Extraction)
- [ ] Day 1-2: Write comprehensive integration tests
- [ ] Day 3-5: Extract `_check_historical_question()`
- [ ] Day 6-7: Extract `_classify_intent()`
- [ ] Day 8-9: Extract `_retrieve_contexts()`
- [ ] Day 10-11: Extract `_generate_sql()`
- [ ] Day 12-13: Extract `_correct_sql()`
- [ ] Day 14: Code review and adjustments

### Week 3: Priority 1.2 (ServiceContainer Builder)
- [ ] Day 1-2: Create `ServiceContainerBuilder` class
- [ ] Day 3-4: Migrate services one by one
- [ ] Day 5: Testing and validation

### Week 4: Priority 1.3 (Pipeline Abstraction)
- [ ] Day 1-2: Create new `BasicPipeline` with generics
- [ ] Day 3-5: Migrate generation pipelines
- [ ] Day 6-7: Testing and documentation

### Week 5: Priority 2.1 & 2.2
- [ ] Day 1-2: Exception hierarchy
- [ ] Day 3-4: Configuration refactoring
- [ ] Day 5: Testing

### Week 6: Priority 2.3 & Buffer
- [ ] Day 1-2: Prompt extraction
- [ ] Day 3-5: Bug fixes, documentation, final testing

---

## 🎯 Risk Assessment

### Risk Matrix

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Breaking existing functionality | Medium | High | Comprehensive tests before refactoring |
| Performance degradation | Low | Medium | Benchmark before/after |
| Team resistance | Low | Low | Clear documentation, gradual rollout |
| Incomplete migration | Medium | Medium | Feature flags, rollback plan |

### Mitigation Strategies

1. **Feature Flags**
   ```python
   if settings.use_refactored_service:
       return await new_ask_service.ask(request)
   else:
       return await legacy_ask_service.ask(request)
   ```

2. **A/B Testing**
   - Route 10% traffic to refactored code
   - Monitor errors, latency
   - Gradually increase to 100%

3. **Rollback Plan**
   - Keep old code for 2 weeks
   - Quick rollback via feature flag
   - Monitoring alerts for anomalies

---

## ✅ Success Criteria

### Quantitative Metrics

| Metric | Before | Target | Measurement |
|--------|--------|--------|-------------|
| Average Function Length | 150 lines | < 50 lines | `radon cc src/ -a` |
| Test Coverage | ~60% | > 80% | `pytest --cov` |
| Type Coverage | ~70% | > 95% | `mypy --strict` |
| Cyclomatic Complexity | 25+ | < 10 | `radon cc src/ -s` |
| Code Duplication | ~15% | < 5% | `pylint --enable=duplicate-code` |

### Qualitative Metrics

- [ ] New developers can onboard faster (< 1 week to first PR)
- [ ] Bug fix time reduced by 30%
- [ ] Adding new service takes < 1 hour
- [ ] Code review time reduced by 40%

### Must-Have Outcomes

✅ **All existing tests pass**  
✅ **No performance regression (< 5% latency increase)**  
✅ **API contracts unchanged**  
✅ **Documentation updated**

---

## 📚 Appendix

### A. Tools and Commands

```bash
# Code quality
ruff check src/
mypy --strict src/
radon cc src/ -s

# Testing
pytest --cov=src --cov-report=html
pytest -v tests/pytest/services/test_ask_service.py

# Formatting
black src/
isort src/

# Complexity analysis
radon cc src/web/v1/services/ask.py -s
```

### B. References

- [Refactoring: Improving the Design of Existing Code](https://martinfowler.com/books/refactoring.html) - Martin Fowler
- [Clean Code](https://www.amazon.com/Clean-Code-Handbook-Software-Craftsmanship/dp/0132350882) - Robert C. Martin
- [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)

### C. Related Documents

- `REFACTORING_TODO.md` - Detailed task tracking
- `.cursorrules` - Project guidelines
- `analytics-ai-service/docs/code_design.md` - Architecture documentation

---

**Document Status**: ✅ Approved for Implementation  
**Next Review**: After Week 3  
**Contact**: development-team@analyticsai.com


