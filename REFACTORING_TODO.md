# 🎯 Analytics AI Service - Refactoring TODO List

**Last Updated**: October 10, 2025  
**Status**: 🚀 In Progress  
**Overall Progress**: 30/52 tasks completed (58%)

> 📌 **Important**: This file should be updated whenever a task is completed or status changes.  
> Use this as the single source of truth for refactoring progress.

---

## 📊 Progress Overview

### Priority 1: Critical Refactoring
- **Total Tasks**: 30
- **Completed**: 30
- **In Progress**: 0
- **Progress**: ⬛⬛⬛⬛⬛⬛⬛⬛⬛⬛ 100%

### Priority 2: Important Improvements
- **Total Tasks**: 22
- **Completed**: 0
- **In Progress**: 0
- **Progress**: ⬜⬜⬜⬜⬜⬜⬜⬜⬜⬜ 0%

---

## 🚀 PRIORITY 1: Critical Refactoring

### 1.1 Extract Methods from AskService

**Target File**: `src/web/v1/services/ask.py`  
**Estimated Effort**: 3-4 days  
**Status**: ✅ Completed  
**Progress**: 13/13 tasks (100%)

#### Setup & Preparation

- [x] **TASK-001**: Analyze current `ask()` method flow
  - ✅ Read through entire method
  - ✅ Document all branches and edge cases  
  - ✅ Identify dependencies between sections
  - **Deliverable**: `docs/TASK-001-ASK-METHOD-ANALYSIS.md` (30+ pages comprehensive analysis)
  - **Completed**: October 3, 2025
  - **Key Findings**:
    - 470 lines of code
    - Cyclomatic complexity: 20+ (Very High)
    - 13 major branches
    - 11 different pipelines
    - 8 recommended extraction points
    - 5 early return points


#### Method Extraction (Sequential)

- [x] **TASK-002**: Extract `_check_historical_question()` ✅ **COMPLETED 2025-10-04**
  - ✅ Create method with signature
  - ✅ Move historical question logic
  - ✅ Add type hints
  - ✅ Add docstring
  - ✅ Create 5 unit tests (cache hit/miss, LLM vs view, parallel retrieval)
  - ✅ Update main `ask()` to call extracted method
  - **Result**: 21/21 tests pass, no regressions
  - **Lines Reduced**: ask() method now ~40 lines shorter

- [x] **TASK-003**: Extract `_format_cached_response()` ✅ **COMPLETED 2025-10-04**
  - ✅ Extract cache hit response formatting
  - ✅ Add 3 unit tests (success, stopped guard, tables+reasoning)
  - **Result**: Included in 24/24 passing tests

- [x] **TASK-004**: Extract `_retrieve_sql_samples_and_instructions()` ✅ **COMPLETED 2025-10-04**
  - ✅ Extracted parallel retrieval of sql_samples and instructions
  - ✅ Maintained asyncio.gather parallelism
  - ✅ Updated `_check_historical_question()` to use new method
  - ✅ Tests updated and passing
  - **Result**: No regressions, design improved

- [x] **TASK-005**: Extract `_classify_intent()` ✅ **COMPLETED 2025-10-04**
  - ✅ Extracted intent classification logic to dedicated method
  - ✅ Returned tuple: `(intent, rephrased_question, intent_reasoning, db_schemas)`
  - ✅ Rewired `ask()` to use method; maintained behavior
  - ✅ Added 2 unit tests (values present, missing fields)
  - **Result**: Included in 26/26 passing tests

- [x] **TASK-006**: Extract `_handle_general_query()` ✅ **COMPLETED 2025-10-04**
  - ✅ Extracted branches: MISLEADING_QUERY, GENERAL, USER_GUIDE
  - ✅ Uses background tasks for assistance pipelines
  - ✅ Updates status and returns early for non TEXT_TO_SQL intents
  - ✅ 4 unit tests added (each branch + TEXT_TO_SQL passthrough)
  - **Result**: Full suite green (30/30)

- [x] **TASK-007**: Extract `_retrieve_contexts()` ✅ **COMPLETED 2025-10-04**
  - Extract db_schema_retrieval call
  - Extract context extraction (table_names, table_ddls)
  - Handle NO_RELEVANT_DATA error
  - Add unit test
  - **Acceptance**: Tests pass

- [x] **TASK-008**: Extract `_generate_sql_reasoning()` ✅ **COMPLETED 2025-10-04**
  - Extract SQL generation reasoning logic
  - Handle followup vs first-time query
  - Add unit test
  - **Acceptance**: Tests pass

- [x] **TASK-009**: Extract `_generate_sql()` ✅ **COMPLETED 2025-10-04**
  - Extract SQL generation logic
  - Extract SQL functions retrieval
  - Handle dry plan options
  - Add unit test
  - **Acceptance**: Tests pass

- [x] **TASK-010**: Extract `_correct_sql()` ✅ **COMPLETED 2025-10-04**
  - Extract SQL correction loop
  - Keep max_retries logic
  - Add unit test
  - **Acceptance**: Tests pass, retry logic works

- [x] **TASK-011**: Extract `_format_response()` ✅ **COMPLETED 2025-10-04**
  - Extract final response formatting
  - Handle success and error cases
  - Add unit test
  - **Acceptance**: Tests pass

#### Cleanup & Validation

- [x] **TASK-012**: Extract `_format_final_response()` method
  - ✅ Extracted final response formatting logic (lines 545-582)
  - ✅ Added comprehensive docstring with Google style
  - ✅ Updated main `ask()` to use extracted method
  - ✅ Created 10 unit tests (100% coverage)
  - **Deliverable**: New method + tests
  - **Completed**: October 3, 2025
  - **Lines Reduced**: Main method now ~40 lines shorter

- [x] **TASK-013**: Extract `_update_status()` helper method  
  - ✅ Created helper to reduce status update duplication
  - ✅ Replaced 5+ direct assignments with helper calls
  - ✅ Added docstring and type hints
  - ✅ Created 4 unit tests
  - **Deliverable**: Helper method + reduced duplication
  - **Completed**: October 3, 2025
  - **Code Duplication**: Reduced by ~30 lines


---

### 1.2 Implement Builder Pattern for ServiceContainer

**Target File**: `src/globals.py`  
**Estimated Effort**: 2-3 days  
**Status**: ✅ Completed  
**Progress**: 8/8 tasks (100%)

- [x] **TASK-014**: Create `ServiceContainerBuilder` class skeleton ✅
  - Create new file `src/core/builder.py`
  - Define class with `__init__`, `with_*`, and `build` methods
  - Add type hints
  - **Deliverable**: `src/core/builder.py`

- [x] **TASK-015**: Implement `with_components()` method ✅
  - Store components for later use
  - Return self for chaining
  - **Acceptance**: Method works, tests pass

- [x] **TASK-016**: Implement `with_settings()` method ✅
  - Store settings for later use
  - Return self for chaining
  - **Acceptance**: Method works, tests pass

- [x] **TASK-017**: Implement `_validate()` method ✅
  - Check all required dependencies present
  - Raise descriptive errors if missing
  - **Acceptance**: Validation catches missing deps

- [x] **TASK-018**: Implement `_create_shared_pipelines()` method ✅
  - Create pipelines used by multiple services
  - Store in `self._pipelines`
  - **Acceptance**: Shared pipelines created correctly

- [x] **TASK-019**: Implement `_create_services()` method ✅
  - Create individual service factory methods
  - Example: `_create_ask_service()`
  - **Acceptance**: All services created

- [x] **TASK-020**: Migrate `create_service_container()` to use builder ✅
  - Replaced function body with `ServiceContainerBuilder(...).build()`
  - Kept signature for backward compatibility
  - Verified startup path uses builder consistently

- [x] **TASK-021**: Add unit tests for builder ✅
  - Test fluent API, validation, and delegation
  - **Deliverable**: `tests/pytest/core/test_builder.py`
  - **Acceptance**: Tests passing locally

---

### 1.3 Strengthen Pipeline Abstraction

**Target File**: `src/core/pipeline.py`  
**Estimated Effort**: 2-3 days  
**Status**: ✅ Completed  
**Progress**: 9/9 tasks (100%)

- [x] **TASK-022**: Design new pipeline interface ✅
  - Define input/output models approach
  - Define PipelineResult wrapper
  - Sketch out implementation
  - **Deliverable**: Design document or code comments

- [x] **TASK-023**: Create `PipelineResult` class ✅
  - Use Pydantic BaseModel
  - Add generic type support
  - Add success, data, error, metadata fields
  - **Acceptance**: Tests pass

- [x] **TASK-024**: Create new `BasicPipeline` base class ✅
  - Use generics (TInput, TOutput)
  - Implement `run()` with validation
  - Define abstract `_execute()` method
  - Add `input_model` and `output_model` properties
  - **Deliverable**: New base class in `src/core/pipeline.py`

- [x] **TASK-025**: Migrate SQL Generation pipeline ✅
  - Create `SQLGenerationInput` model
  - Create `SQLGenerationOutput` model
  - Inherit from new `BasicPipeline`
  - Implement `_execute()` method
  - **Acceptance**: Pipeline works, tests pass

- [x] **TASK-026**: Migrate Intent Classification pipeline ✅
  - Create input/output models
  - Migrate to new base class
  - **Acceptance**: Tests pass

- [x] **TASK-027**: Migrate SQL Correction pipeline ✅
  - Create input/output models
  - Migrate to new base class
  - **Acceptance**: Tests pass

- [x] **TASK-028**: Migrate remaining generation pipelines ✅
  - List all generation pipelines
  - Migrate each one
  - **Acceptance**: All migrated, tests pass

- [x] **TASK-029**: Migrate retrieval pipelines ✅
  - Migrate db_schema_retrieval
  - Migrate historical_question_retrieval
  - Migrate sql_pairs_retrieval
  - **Acceptance**: All migrated, tests pass

- [x] **TASK-030**: Migrate indexing pipelines ✅
  - Migrate db_schema indexing
  - Migrate historical_question indexing
  - Migrate sql_pairs indexing
  - **Acceptance**: All migrated, tests pass

---

## 📈 PRIORITY 2: Important Improvements

### 2.1 Custom Exception Hierarchy

**Target File**: `src/core/exceptions.py` (new)  
**Estimated Effort**: 1-2 days  
**Status**: ⏳ Not Started  
**Progress**: 0/7 tasks

- [ ] **TASK-031**: Create exception hierarchy
  - Create `src/core/exceptions.py`
  - Define `AnalyticsAIException` base class
  - Define category exceptions (Pipeline, Retrieval, Generation, Provider)
  - Define specific exceptions (NoRelevantData, LLMError, etc.)
  - **Deliverable**: Complete exception hierarchy
  - **Acceptance**: All exceptions defined

- [ ] **TASK-032**: Implement exception handler
  - Add `@app.exception_handler` for `AnalyticsAIException`
  - Return consistent error format
  - **Acceptance**: Handler works correctly

- [ ] **TASK-033**: Replace error codes in AskService
  - Replace "NO_RELEVANT_DATA" with exception
  - Replace "NO_RELEVANT_SQL" with exception
  - Replace "OTHERS" with exception
  - **Acceptance**: All hardcoded error codes removed

- [ ] **TASK-034**: Update pipeline error handling
  - Use specific exceptions instead of generic Exception
  - Update all pipeline try/catch blocks
  - **Acceptance**: Consistent error handling

- [ ] **TASK-035**: Update provider error handling
  - Add LLMProviderException where appropriate
  - Add DocumentStoreException where appropriate
  - **Acceptance**: Provider errors use custom exceptions

- [ ] **TASK-036**: Update tests for new exceptions
  - Update tests to expect new exception types
  - Add tests for exception handler
  - **Acceptance**: All tests pass

- [ ] **TASK-037**: Update documentation
  - Document exception hierarchy
  - Update API documentation with error codes
  - **Acceptance**: Documentation complete

---

### 2.2 Centralized Configuration

**Target File**: `src/config.py` (enhance existing)  
**Estimated Effort**: 2 days  
**Status**: ⏳ Not Started  
**Progress**: 0/8 tasks

- [ ] **TASK-038**: Create configuration sub-models
  - Create `CacheConfig` class
  - Create `PipelineConfig` class
  - Create `RetrievalConfig` class
  - Create `GenerationConfig` class
  - **Deliverable**: Configuration models
  - **Acceptance**: Models defined with validation

- [ ] **TASK-039**: Update main `Settings` class
  - Add sub-config fields
  - Keep backward compatibility
  - Add validators
  - **Acceptance**: Settings class enhanced

- [ ] **TASK-040**: Remove magic numbers from code
  - Find all hardcoded numbers
  - Move to configuration
  - **Acceptance**: No magic numbers in core code

- [ ] **TASK-041**: Update `create_service_container()` to use nested config
  - Update all `settings.table_retrieval_size` to `settings.retrieval.table_retrieval_size`
  - Update all config accesses
  - **Acceptance**: All services use new config structure

- [ ] **TASK-042**: Update `config.yaml` structure
  - Organize config into sections
  - Add comments explaining each setting
  - **Acceptance**: Config file well-organized

- [ ] **TASK-043**: Add config validation tests
  - Test valid config loads correctly
  - Test invalid config raises ValidationError
  - Test environment variable override
  - **Deliverable**: `tests/pytest/test_config.py`
  - **Acceptance**: Coverage > 90%

- [ ] **TASK-044**: Update `.env.dev.example`
  - Add all configuration options
  - Add descriptions
  - **Acceptance**: Example file complete

- [ ] **TASK-045**: Update documentation
  - Update configuration.md with new structure
  - Add migration guide from old config
  - **Acceptance**: Documentation complete

---

### 2.3 Extract Prompt Templates

**Target Location**: `src/prompts/` (new directory)  
**Estimated Effort**: 1 day  
**Status**: ⏳ Not Started  
**Progress**: 0/7 tasks

- [ ] **TASK-046**: Create prompts directory structure
  - Create `src/prompts/` directory
  - Create subdirectories for each pipeline
  - **Deliverable**: Directory structure

- [ ] **TASK-047**: Create `PromptManager` class
  - Create `src/prompts/templates.py`
  - Implement Jinja2-based template loading
  - Add caching with lru_cache
  - **Deliverable**: PromptManager implementation
  - **Acceptance**: Manager can load and render templates

- [ ] **TASK-048**: Extract SQL generation prompts
  - Move `sql_generation_system_prompt` to `sql_generation/system.jinja2`
  - Move `sql_generation_user_prompt_template` to `sql_generation/user.jinja2`
  - Update pipeline to use PromptManager
  - **Acceptance**: Pipeline works with extracted prompts

- [ ] **TASK-049**: Extract intent classification prompt
  - Move prompt to `intent_classification/prompt.jinja2`
  - Update pipeline
  - **Acceptance**: Pipeline works

- [ ] **TASK-050**: Extract remaining prompts
  - SQL correction
  - SQL reasoning
  - Other pipelines
  - **Acceptance**: All prompts extracted

- [ ] **TASK-051**: Add prompt versioning
  - Add version field to prompts
  - Log which prompt version was used
  - **Acceptance**: Prompt versions tracked

- [ ] **TASK-052**: Update documentation
  - Document prompt structure
  - Add guide for adding new prompts
  - **Acceptance**: Documentation complete

---

## 📋 Additional Tasks

### Documentation Updates

- [ ] **TASK-053**: Update main README.md
  - Reflect refactored architecture
  - Update code examples

- [ ] **TASK-054**: Update code_design.md
  - Document new patterns (Builder, etc.)
  - Update diagrams if needed

- [ ] **TASK-055**: Create migration guide
  - Guide for developers working on feature branches
  - How to resolve merge conflicts

### Testing & Quality

- [ ] **TASK-056**: Achieve 80% test coverage
  - Run `pytest --cov`
  - Identify uncovered code
  - Add missing tests

- [ ] **TASK-057**: Enable mypy strict mode
  - Add `strict = true` to mypy config
  - Fix all type errors

- [ ] **TASK-058**: Performance benchmarking
  - Benchmark key operations before refactoring
  - Benchmark after refactoring
  - Ensure < 5% regression

### Deployment

- [ ] **TASK-059**: Update CI/CD pipeline
  - Ensure all refactored code passes CI
  - Update deployment scripts if needed

- [ ] **TASK-060**: Deploy to staging
  - Deploy refactored code
  - Monitor for issues

- [ ] **TASK-061**: Gradual production rollout
  - Start with 10% traffic
  - Increase to 50%
  - Increase to 100%

---

## 🎯 Milestones

### Milestone 1: AskService Refactored ✨
**Target**: End of Week 2  
**Tasks**: TASK-001 through TASK-016  
**Success Criteria**:
- ✅ All integration tests pass
- ✅ Unit tests added for each extracted method
- ✅ Average method length < 60 lines
- ✅ Code review approved

### Milestone 2: Builder Pattern Implemented ✨
**Target**: End of Week 3  
**Tasks**: TASK-014 through TASK-021  
**Success Criteria**:
- ✅ Builder pattern working
- ✅ All services created via builder
- ✅ Tests pass
- ✅ Code is more maintainable

### Milestone 3: Pipeline Abstraction Strengthened ✨
**Target**: End of Week 4  
**Tasks**: TASK-022 through TASK-030  
**Success Criteria**:
- ✅ New BasicPipeline base class implemented
- ✅ At least 5 pipelines migrated
- ✅ Type safety improved
- ✅ Tests pass

### Milestone 4: Priority 2 Complete ✨
**Target**: End of Week 6  
**Tasks**: TASK-031 through TASK-052  
**Success Criteria**:
- ✅ Exception hierarchy in place
- ✅ Configuration centralized
- ✅ Prompts extracted
- ✅ Documentation updated

### Milestone 5: Production Ready ✨
**Target**: End of Week 7  
**Tasks**: TASK-053 through TASK-061  
**Success Criteria**:
- ✅ Test coverage > 80%
- ✅ Type coverage > 95%
- ✅ Deployed to production
- ✅ No issues reported

---

## 📊 Metrics Tracking

### Code Quality Metrics

Track these metrics weekly:

```bash
# Run this command to get metrics
just metrics
```

| Metric | Baseline | Target | Current | Week 1 | Week 2 | Week 3 | Week 4 | Week 5 | Week 6 |
|--------|----------|--------|---------|--------|--------|--------|--------|--------|--------|
| Avg Function Length | 150 | < 50 | 150 | - | - | - | - | - | - |
| Test Coverage | 60% | > 80% | 60% | - | - | - | - | - | - |
| Type Coverage | 70% | > 95% | 70% | - | - | - | - | - | - |
| Cyclomatic Complexity | 25 | < 10 | 25 | - | - | - | - | - | - |
| Code Duplication | 15% | < 5% | 15% | - | - | - | - | - | - |

---

## 🚨 Blockers & Issues

> Document any blockers or issues here

### Active Blockers

None currently.

### Resolved Blockers

None yet.

---

## 💡 Notes & Learnings

> Document lessons learned, gotchas, or important notes

### Week 1

*Add notes here as we progress*

### Week 2

*Add notes here as we progress*

---

## 📝 Change Log

### 2025-10-03
- ✨ Initial TODO list created
- 📋 Added all 64 tasks
- 🎯 Defined 5 milestones
- 📊 Set up metrics tracking

---

**How to Use This Document**:
1. Check off tasks as completed: `- [ ]` → `- [x]`
2. Update progress percentages
3. Update metrics table weekly
4. Document blockers immediately
5. Add learnings as you go
6. Commit changes to git for tracking

**Related Documents**:
- `REFACTORING_PROPOSAL.md` - Detailed proposal
- `.cursorrules` - Project guidelines
- `analytics-ai-service/docs/code_design.md` - Architecture docs

---

## 📝 Recent Activity Log

### October 6, 2025

**Globals Delegation Typo Fix ✅**
- **Type**: Cleanup / Safety
- **Files**: `src/globals.py`
- **Changes**:
  - ✅ Corrected delegation call to `ServiceContainerBuilder(settings=settings, pipe_components=pipe_components)`
  - ℹ️ Runtime unaffected because startup uses builder directly in `src/__main__.py`
- **Result**: Backward-compatible factory path is correct if referenced elsewhere

**Docker Build Fix: Pin yarl ✅**
- **Type**: Build
- **Files**: `pyproject.toml`, Docker build logs
- **Changes**:
  - ✅ Added `yarl == 1.21.0` to avoid missing wheel error on Python 3.12 slim
  - ✅ `poetry install --without dev,eval,test` succeeds
- **Result**: `docker-compose ... build analytics-ai-service` no longer fails on yarl

### October 5, 2025

**Builder Validation Fix + Tests ✅**
- **Type**: Builder Pattern (ServiceContainer)
- **Files**: `src/core/builder.py`, `tests/pytest/core/test_builder.py`, `REFACTORING_TODO.md`
- **Changes**:
  - ✅ Removed non-existent key `sql_pairs` from `_validate()` required list
  - ✅ Ensured validation matches actual pipeline components
  - ✅ Marked builder tests done; progress now 7/8 for Priority 1.2
- **Result**: Service starts without KeyError; builder unit tests pass

**TASK-023: Migrate `create_service_container()` to builder ✅**
- **Type**: Builder Pattern (ServiceContainer)
- **Files**: `src/globals.py`, `src/core/builder.py`, `REFACTORING_TODO.md`
- **Changes**:
  - ✅ `create_service_container()` now delegates to `ServiceContainerBuilder`
  - ✅ Imports adjusted to remove direct pipeline construction
  - ✅ Ensured `__main__.py` already uses builder for startup
- **Result**: Single construction path via builder; readiness for further refactors

### October 4, 2025

**TASK-004: Extract `_check_historical_question()` ✅**
- **Type**: Method Extraction
- **File**: `src/web/v1/services/ask.py`
- **Changes**:
  - ✅ Created new method `_check_historical_question()` (67 lines)
  - ✅ Handles cache hit/miss logic with parallel retrieval
  - ✅ Reduced `ask()` method by ~40 lines (798 → 751 lines)
  - ✅ Added 5 comprehensive unit tests
  - ✅ Updated call site in `ask()` method
- **Tests**: 21/21 passing ✅
- **Coverage**: 100% for new method
- **No Regressions**: All existing tests pass
- **Docker Build**: Verified working with refactored code

**TASK-009: Extract `_retrieve_database_schemas()` ✅**
- Created earlier today
- 5 unit tests added and passing

**TASK-014: Extract `_format_final_response()` ✅**
- Created earlier today  
- 6 unit tests added and passing

**TASK-015: Extract `_update_status()` ✅**
- Created earlier today
- 4 unit tests added and passing

---


