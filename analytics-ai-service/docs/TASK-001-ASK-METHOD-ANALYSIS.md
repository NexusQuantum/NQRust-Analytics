# TASK-001: Analysis of AskService.ask() Method

**Date**: October 3, 2025  
**Analyst**: Refactoring Team  
**File**: `src/web/v1/services/ask.py`  
**Method**: `AskService.ask()`  
**Lines**: 131-600 (470 lines)  
**Status**: ✅ Complete

---

## 📊 Executive Summary

### Key Statistics
- **Total Lines**: 470 lines (excluding docstrings)
- **Cyclomatic Complexity**: ~35+ (Very High)
- **Number of Branches**: 12+ major branches
- **Dependencies**: 11 pipelines, 15+ state variables
- **Return Points**: 5 explicit returns
- **Status Updates**: 8 different status states

### Severity Assessment
🔴 **CRITICAL**: This is a textbook "God Object" anti-pattern
- Too many responsibilities (orchestration, validation, error handling, state management)
- Extremely difficult to test in isolation
- High risk for bugs
- Nearly impossible to modify safely

---

## 🗺️ High-Level Flow Map

```
START: ask(ask_request)
  │
  ├─ [SETUP] Initialize variables (lines 136-171)
  │
  ├─ [SECTION 1] Historical Question Check (lines 178-228)
  │   ├─ Query historical_question pipeline
  │   ├─ If found → Format and RETURN (early exit)
  │   └─ If not found → Retrieve sql_samples & instructions (parallel)
  │
  ├─ [SECTION 2] Intent Classification (lines 229-328)
  │   ├─ Classify intent (MISLEADING/GENERAL/USER_GUIDE/TEXT_TO_SQL)
  │   ├─ If MISLEADING_QUERY → Start assistance task & RETURN
  │   ├─ If GENERAL → Start assistance task & RETURN
  │   ├─ If USER_GUIDE → Start assistance task & RETURN
  │   └─ If TEXT_TO_SQL → Continue
  │
  ├─ [SECTION 3] Schema Retrieval (lines 329-369)
  │   ├─ Query db_schema_retrieval pipeline
  │   ├─ Extract table_names & table_ddls
  │   └─ If no documents → Error: NO_RELEVANT_DATA & RETURN
  │
  ├─ [SECTION 4] SQL Generation Reasoning (lines 371-419)
  │   ├─ Optional: only if allow_sql_generation_reasoning
  │   ├─ Branch: histories? → followup_sql_generation_reasoning
  │   └─ Else → sql_generation_reasoning
  │
  ├─ [SECTION 5] SQL Generation (lines 421-483)
  │   ├─ Retrieve sql_functions (optional)
  │   ├─ Branch: histories? → followup_sql_generation
  │   └─ Else → sql_generation
  │
  ├─ [SECTION 6] SQL Correction Loop (lines 484-543)
  │   ├─ If valid SQL → api_results populated
  │   ├─ If invalid SQL:
  │   │   ├─ Loop: current_retries < max_retries
  │   │   ├─ Call sql_correction pipeline
  │   │   ├─ If fixed → api_results populated & break
  │   │   └─ If still invalid → continue loop
  │   └─ If timeout → break
  │
  ├─ [SECTION 7] Final Response (lines 545-580)
  │   ├─ If api_results → Format success response
  │   └─ Else → Error: NO_RELEVANT_SQL
  │
  └─ [EXCEPTION] Catch-all error handler (lines 583-600)
      └─ Return: OTHERS error

RETURN: results dict
```

---

## 📦 Detailed Section Breakdown

### SECTION 0: Setup & Initialization (Lines 136-171)

**Purpose**: Initialize all state variables

**Variables Initialized** (17 total):
```python
# From kwargs
trace_id = kwargs.get("trace_id")

# Result container
results = {"ask_result": {}, "metadata": {...}}

# Request data
query_id = ask_request.query_id
histories = ask_request.histories[:self._max_histories][::-1]  # Reversed

# Pipeline results (initialized empty)
rephrased_question = None
intent_reasoning = None
sql_generation_reasoning = None
sql_samples = []
instructions = []
api_results = []
table_names = []
error_message = None
invalid_sql = None

# Configuration flags (derived from settings + request)
allow_sql_generation_reasoning = ...
enable_column_pruning = ...
allow_sql_functions_retrieval = ...
max_sql_correction_retries = ...
current_sql_correction_retries = 0
use_dry_plan = ...
allow_dry_plan_fallback = ...
```

**Dependencies**:
- `self._max_histories` (config)
- `self._allow_sql_generation_reasoning` (config)
- `self._enable_column_pruning` (config)
- `self._allow_sql_functions_retrieval` (config)
- `self._max_sql_correction_retries` (config)

**Issues**:
- Too many variables (17+)
- Complex derivation logic for flags
- Mutable state scattered

---

### SECTION 1: Historical Question Check (Lines 178-228)

**Purpose**: Check if question has been answered before (cache hit)

**Flow**:
```python
1. Check if query is not stopped
2. Update status to "understanding"
3. Call historical_question pipeline
4. Extract top 1 result
5. IF result found:
   - Format as AskResult
   - Set sql_generation_reasoning = ""
   - EARLY RETURN ✅
6. ELSE:
   - Retrieve sql_samples (parallel)
   - Retrieve instructions (parallel)
   - Continue to next section
```

**Pipelines Used**:
- `historical_question` (retrieval)
- `sql_pairs_retrieval` (retrieval) - parallel
- `instructions_retrieval` (retrieval) - parallel

**State Changes**:
- `self._ask_results[query_id]` = "understanding"
- `api_results` populated (if cache hit)
- `sql_samples` populated
- `instructions` populated

**Early Exit Point**: Yes (line 206, 272, 298, 318)

**Dependencies**:
- Depends on: `query_id`, `user_query`, `project_id`
- Modifies: `api_results`, `sql_samples`, `instructions`, `sql_generation_reasoning`

**Complexity**: Medium (parallel operations with asyncio.gather)

---

### SECTION 2: Intent Classification (Lines 229-328)

**Purpose**: Classify user intent and handle non-SQL queries

**Flow**:
```python
1. IF allow_intent_classification:
   2. Call intent_classification pipeline
   3. Extract: intent, rephrased_question, reasoning
   4. IF rephrased_question exists:
      - Update user_query
   5. SWITCH intent:
      CASE "MISLEADING_QUERY":
         - Start misleading_assistance task (async)
         - Update status to "finished"
         - EARLY RETURN ✅
      CASE "GENERAL":
         - Start data_assistance task (async)
         - Update status to "finished"
         - EARLY RETURN ✅
      CASE "USER_GUIDE":
         - Start user_guide_assistance task (async)
         - Update status to "finished"
         - EARLY RETURN ✅
      CASE "TEXT_TO_SQL":
         - Update status to "understanding"
         - Continue to next section
```

**Pipelines Used**:
- `intent_classification` (generation)
- `misleading_assistance` (generation) - async task
- `data_assistance` (generation) - async task
- `user_guide_assistance` (generation) - async task

**State Changes**:
- `user_query` (possibly updated to rephrased_question)
- `rephrased_question` populated
- `intent_reasoning` populated
- `self._ask_results[query_id]` = "finished" (for general queries)

**Early Exit Points**: 3 exits (lines 272, 298, 318)

**Dependencies**:
- Depends on: `user_query`, `histories`, `sql_samples`, `instructions`, `configurations`
- Modifies: `user_query`, `rephrased_question`, `intent_reasoning`

**Complexity**: High (multiple async tasks, multiple branches)

**Notable Pattern**:
- Uses `asyncio.create_task()` to start background tasks
- Fire-and-forget pattern for general queries

---

### SECTION 3: Schema Retrieval (Lines 329-369)

**Purpose**: Retrieve relevant database schemas for SQL generation

**Flow**:
```python
1. Check if not stopped AND no api_results
2. Update status to "searching"
3. Call db_schema_retrieval pipeline
4. Extract:
   - documents (retrieval_results)
   - table_names
   - table_ddls
5. IF documents is empty:
   - Log error: NO_RELEVANT_DATA
   - Update status to "failed"
   - EARLY RETURN ✅
6. ELSE:
   - Continue to next section
```

**Pipelines Used**:
- `db_schema_retrieval` (retrieval)

**State Changes**:
- `self._ask_results[query_id]` = "searching" → "failed" (if error)
- `table_names` populated
- `table_ddls` populated
- `documents` extracted

**Early Exit Point**: Yes (line 369)

**Dependencies**:
- Depends on: `user_query`, `histories`, `project_id`, `enable_column_pruning`
- Modifies: `table_names`, `table_ddls`, `documents`, `_retrieval_result`

**Error Handling**:
- Specific error code: `NO_RELEVANT_DATA`
- Updates metadata with error type

**Complexity**: Medium

---

### SECTION 4: SQL Generation Reasoning (Lines 371-419)

**Purpose**: Generate reasoning/plan for SQL generation (optional)

**Flow**:
```python
1. Check if not stopped AND no api_results AND allow_sql_generation_reasoning
2. Update status to "planning"
3. BRANCH on histories:
   IF histories exist:
      - Call followup_sql_generation_reasoning pipeline
   ELSE:
      - Call sql_generation_reasoning pipeline
4. Extract sql_generation_reasoning from post_process
5. Update status to "planning" (with reasoning)
```

**Pipelines Used**:
- `followup_sql_generation_reasoning` (generation) - for follow-up queries
- `sql_generation_reasoning` (generation) - for first-time queries

**State Changes**:
- `self._ask_results[query_id]` = "planning" (twice: before & after)
- `sql_generation_reasoning` populated

**Conditional Execution**:
- Skipped if `allow_sql_generation_reasoning` is False
- Different pipeline based on `histories` presence

**Dependencies**:
- Depends on: `user_query`, `table_ddls`, `histories`, `sql_samples`, `instructions`, `configurations`
- Modifies: `sql_generation_reasoning`

**Complexity**: Medium (conditional pipeline selection)

---

### SECTION 5: SQL Generation (Lines 421-483)

**Purpose**: Generate SQL query from context

**Flow**:
```python
1. Check if not stopped AND no api_results
2. Update status to "generating"
3. IF allow_sql_functions_retrieval:
      - Retrieve sql_functions
   ELSE:
      - sql_functions = []
4. Extract metadata:
   - has_calculated_field
   - has_metric
   - has_json_field
5. BRANCH on histories:
   IF histories exist:
      - Call followup_sql_generation pipeline
   ELSE:
      - Call sql_generation pipeline
6. Store result in text_to_sql_generation_results
```

**Pipelines Used**:
- `sql_functions_retrieval` (retrieval) - optional
- `followup_sql_generation` (generation) - for follow-up
- `sql_generation` (generation) - for first-time

**State Changes**:
- `self._ask_results[query_id]` = "generating"
- `sql_functions` populated (optional)
- `text_to_sql_generation_results` populated

**Dependencies**:
- Depends on: `user_query`, `table_ddls`, `sql_generation_reasoning`, `histories`, `sql_samples`, `instructions`, `has_*` flags, `sql_functions`, `use_dry_plan`, `allow_dry_plan_fallback`
- Modifies: `sql_functions`, `text_to_sql_generation_results`

**Complexity**: High (many parameters, conditional retrieval)

**Notable**:
- 11 parameters passed to sql_generation pipeline!
- Different pipelines for followup vs first-time

---

### SECTION 6: SQL Correction Loop (Lines 484-543)

**Purpose**: Validate and correct invalid SQL (with retry logic)

**Flow**:
```python
1. Check if valid_generation_result exists:
   IF valid:
      - Format as AskResult
      - Populate api_results
   ELIF invalid_generation_result exists:
      2. WHILE current_retries < max_retries:
         3. Extract invalid_sql and error_message
         4. IF error type is "TIME_OUT":
               - BREAK (don't retry timeouts)
         5. Increment current_retries
         6. Update status to "correcting"
         7. Call sql_correction pipeline
         8. Check result:
            IF valid:
               - Format as AskResult
               - Populate api_results
               - BREAK ✅
            ELSE:
               - Update failed_dry_run_result
               - Continue loop
```

**Pipelines Used**:
- `sql_correction` (generation) - called up to 3 times

**State Changes**:
- `self._ask_results[query_id]` = "correcting"
- `current_sql_correction_retries` incremented
- `invalid_sql` stored
- `error_message` stored
- `api_results` populated (if successful)

**Loop Control**:
- Max iterations: `max_sql_correction_retries` (default 3)
- Break conditions:
  1. Valid SQL generated
  2. Timeout error
  3. Max retries reached

**Dependencies**:
- Depends on: `text_to_sql_generation_results`, `table_ddls`, `instructions`, `project_id`, `use_dry_plan`, `allow_dry_plan_fallback`
- Modifies: `api_results`, `invalid_sql`, `error_message`, `current_sql_correction_retries`

**Complexity**: High (nested conditions, loop, multiple exit points)

**Error Handling**:
- Special handling for TIME_OUT errors (no retry)
- Preserves last error for final response

---

### SECTION 7: Final Response Formation (Lines 545-580)

**Purpose**: Format final response based on results

**Flow**:
```python
1. IF api_results exist:
   2. Check if not stopped
   3. Update status to "finished"
   4. Populate results["ask_result"]
   5. Set results["metadata"]["type"] = "TEXT_TO_SQL"
ELSE:
   6. Log error: NO_RELEVANT_SQL
   7. Check if not stopped
   8. Update status to "failed"
   9. Create AskError:
      - code: "NO_RELEVANT_SQL"
      - message: error_message or "No relevant SQL"
   10. Populate results["metadata"] with error
```

**State Changes**:
- `self._ask_results[query_id]` = "finished" or "failed"
- `results["ask_result"]` populated
- `results["metadata"]` populated

**Error Handling**:
- Error code: `NO_RELEVANT_SQL`
- Includes `invalid_sql` in response

**Dependencies**:
- Depends on: All previous sections (api_results, error_message, invalid_sql)
- Modifies: `results` (final output)

**Complexity**: Low (simple conditional formatting)

---

### SECTION 8: Exception Handler (Lines 583-600)

**Purpose**: Catch-all for unexpected errors

**Flow**:
```python
EXCEPT Exception as e:
   1. Log exception with logger.exception()
   2. Update status to "failed"
   3. Create AskError:
      - code: "OTHERS"
      - message: str(e)
   4. Populate results["metadata"]
   5. RETURN results
```

**Error Handling**:
- Catches ALL exceptions
- Generic error code: `OTHERS`
- Logs full stack trace

**State Changes**:
- `self._ask_results[query_id]` = "failed"
- `results["metadata"]` with error

**Complexity**: Low

**Issues**:
- Too broad exception handling
- Loses specific error context

---

## 🔗 Dependencies Graph

### Input Dependencies
```
ask_request (AskRequest)
├── query (str)
├── query_id (str)
├── project_id (str)
├── histories (List[AskHistory])
├── configurations (Config)
├── ignore_sql_generation_reasoning (bool)
├── enable_column_pruning (bool)
├── use_dry_plan (bool)
├── allow_dry_plan_fallback (bool)
└── custom_instruction (Optional[str])

kwargs
└── trace_id (Optional[str])
```

### Pipeline Dependencies (11 pipelines)
```
1. historical_question (retrieval)
2. sql_pairs_retrieval (retrieval) 
3. instructions_retrieval (retrieval)
4. intent_classification (generation)
5. misleading_assistance (generation - async)
6. data_assistance (generation - async)
7. user_guide_assistance (generation - async)
8. db_schema_retrieval (retrieval)
9. followup_sql_generation_reasoning (generation)
10. sql_generation_reasoning (generation)
11. sql_functions_retrieval (retrieval - optional)
12. followup_sql_generation (generation)
13. sql_generation (generation)
14. sql_correction (generation - retry loop)
```

### State Dependencies (Instance Variables)
```
self._pipelines (Dict[str, BasicPipeline])
self._ask_results (TTLCache)
self._max_histories (int)
self._allow_sql_generation_reasoning (bool)
self._allow_sql_functions_retrieval (bool)
self._allow_intent_classification (bool)
self._enable_column_pruning (bool)
self._max_sql_correction_retries (int)
```

### Data Flow Between Sections
```
Section 1 (Historical Check)
  │
  ├─ Outputs: sql_samples, instructions, (api_results if cache hit)
  │
  └─> Section 2 (Intent Classification)
       │
       ├─ Outputs: user_query (updated), rephrased_question, intent_reasoning
       │
       └─> Section 3 (Schema Retrieval)
            │
            ├─ Outputs: table_names, table_ddls, _retrieval_result
            │
            └─> Section 4 (SQL Reasoning)
                 │
                 ├─ Outputs: sql_generation_reasoning
                 │
                 └─> Section 5 (SQL Generation)
                      │
                      ├─ Outputs: text_to_sql_generation_results, sql_functions
                      │
                      └─> Section 6 (SQL Correction)
                           │
                           ├─ Outputs: api_results, invalid_sql, error_message
                           │
                           └─> Section 7 (Final Response)
                                │
                                └─ Outputs: results (final)
```

---

## 🔀 Branch Analysis

### Major Branching Points

| Line | Condition | Branch A | Branch B | Impact |
|------|-----------|----------|----------|--------|
| 195 | `if historical_question_result:` | Return cached result (early exit) | Continue to retrieval | High - skips entire flow |
| 229 | `if self._allow_intent_classification:` | Classify intent | Skip classification | Medium |
| 249 | `if intent == "MISLEADING_QUERY":` | Handle misleading (early exit) | Continue | High - changes response type |
| 274 | `elif intent == "GENERAL":` | Handle general (early exit) | Continue | High - changes response type |
| 299 | `elif intent == "USER_GUIDE":` | Handle user guide (early exit) | Continue | High - changes response type |
| 352 | `if not documents:` | Error: NO_RELEVANT_DATA (early exit) | Continue | High - failure case |
| 371-374 | `if not stopped AND no api_results AND allow_reasoning:` | Generate reasoning | Skip reasoning | Medium |
| 386 | `if histories:` | Followup reasoning | Regular reasoning | Medium |
| 433 | `if allow_sql_functions_retrieval:` | Retrieve functions | Skip functions | Low |
| 448 | `if histories:` | Followup generation | Regular generation | Medium |
| 484 | `if sql_valid_result:` | Success path | Check for correction | High |
| 495 | `elif failed_dry_run_result:` | Enter correction loop | No correction | High |
| 502 | `if failed_dry_run_result["type"] == "TIME_OUT":` | Break loop | Continue retrying | Medium |
| 545 | `if api_results:` | Success response | Error response | High |

**Total Major Branches**: 13

### Cyclomatic Complexity Calculation
```
Base: 1
+ if statements: 13
+ while loop: 1
+ try/except: 1
+ early returns: 5

Estimated Complexity: 20+ (Very High)
```

**Industry Standard**: 
- < 10: Good
- 10-20: Moderate
- **> 20: High Risk** ← This method

---

## ⚠️ Issues & Code Smells

### 1. God Object 🔴 Critical
**Problem**: Single method does everything
- 470 lines
- 13 major branches
- 11 different pipelines
- 15+ state variables

**Impact**: Impossible to test, modify, or understand

---

### 2. Multiple Responsibilities 🔴 Critical
**Violations of Single Responsibility Principle**:
1. Cache checking
2. Intent classification
3. Query rephrasing
4. Schema retrieval
5. SQL generation reasoning
6. SQL generation
7. SQL validation
8. SQL correction (with retry logic)
9. Response formatting
10. Error handling
11. State management (8 different statuses)

**Impact**: Changes in one area can break others

---

### 3. Deep Nesting 🟡 Medium
**Max Nesting Level**: 5 levels

Example (lines 498-543):
```python
if not stopped:                          # Level 1
    if not api_results:                  # Level 2
        if valid_result:                 # Level 3
            # ...
        elif invalid_result:             # Level 3
            while retries < max:         # Level 4
                if timeout:              # Level 5
                    break
```

**Impact**: Hard to follow logic

---

### 4. Variable Reuse & Mutation 🟡 Medium
**Problematic Variables**:
- `user_query` - mutated at line 247
- `api_results` - mutated in 3 different sections
- `self._ask_results[query_id]` - updated 8+ times

**Impact**: Hard to track state

---

### 5. Early Returns 🟢 Low
**5 Early Return Points**:
1. Line 273 - MISLEADING_QUERY
2. Line 298 - GENERAL
3. Line 319 - USER_GUIDE
4. Line 369 - NO_RELEVANT_DATA
5. Line 582 - Final return

**Impact**: Makes control flow harder to follow, but not critical

---

### 6. Fire-and-Forget Tasks 🟡 Medium
**Lines**: 250, 275, 300

Uses `asyncio.create_task()` without awaiting or tracking

**Issues**:
- No error handling for background tasks
- Can't cancel or monitor progress
- Potential resource leaks

**Impact**: Hard to debug, potential failures go unnoticed

---

### 7. Magic Numbers 🟢 Low
**Examples**:
- `[:1]` (line 193) - Top 1 result
- Status updates without constants

**Impact**: Minor, but reduces readability

---

### 8. Inconsistent Error Handling 🟡 Medium
**3 Different Patterns**:
1. Early return with error (lines 354-369)
2. Continue with empty result (line 545-580)
3. Generic exception catch (lines 583-600)

**Impact**: Inconsistent error responses

---

## 🎯 Recommended Extraction Points

### High Priority Extractions

#### 1. `_check_historical_question()` 
**Lines**: 185-228  
**Responsibility**: Check cache for previous answers  
**Returns**: `Optional[List[AskResult]]`  
**Dependencies**: `historical_question`, `sql_pairs_retrieval`, `instructions_retrieval`

```python
async def _check_historical_question(
    self,
    user_query: str,
    project_id: str,
) -> tuple[Optional[List[AskResult]], list, list]:
    """Check if question exists in cache and retrieve supporting data."""
    # Return: (api_results, sql_samples, instructions)
```

---

#### 2. `_classify_and_handle_intent()`
**Lines**: 229-328  
**Responsibility**: Classify intent and handle non-SQL queries  
**Returns**: `Optional[dict]` (None if continue, dict if early return)  
**Dependencies**: `intent_classification`, `misleading_assistance`, `data_assistance`, `user_guide_assistance`

```python
async def _classify_and_handle_intent(
    self,
    user_query: str,
    histories: list,
    sql_samples: list,
    instructions: list,
    request: AskRequest,
    query_id: str,
    trace_id: str,
) -> tuple[Optional[dict], Optional[str], Optional[str], Optional[str]]:
    """
    Classify intent and handle general queries.
    
    Returns:
        (early_return_result, updated_query, rephrased_question, intent_reasoning)
    """
```

---

#### 3. `_retrieve_database_schemas()`
**Lines**: 339-369  
**Responsibility**: Retrieve relevant schemas  
**Returns**: `tuple[list, list, dict]` or raises exception  
**Dependencies**: `db_schema_retrieval`

```python
async def _retrieve_database_schemas(
    self,
    user_query: str,
    histories: list,
    project_id: str,
    enable_column_pruning: bool,
) -> tuple[list[str], list[str], dict]:
    """
    Retrieve database schemas relevant to query.
    
    Returns:
        (table_names, table_ddls, retrieval_result)
    
    Raises:
        NoRelevantDataException: If no schemas found
    """
```

---

#### 4. `_generate_sql_reasoning()`
**Lines**: 386-408  
**Responsibility**: Generate reasoning plan  
**Returns**: `Optional[str]`  
**Dependencies**: `followup_sql_generation_reasoning`, `sql_generation_reasoning`

```python
async def _generate_sql_reasoning(
    self,
    user_query: str,
    table_ddls: list,
    histories: list,
    sql_samples: list,
    instructions: list,
    configurations: Config,
    query_id: str,
) -> Optional[str]:
    """Generate SQL generation reasoning/plan."""
```

---

#### 5. `_generate_sql()`
**Lines**: 433-483  
**Responsibility**: Generate SQL query  
**Returns**: `dict`  
**Dependencies**: `sql_functions_retrieval`, `sql_generation`, `followup_sql_generation`

```python
async def _generate_sql(
    self,
    user_query: str,
    table_ddls: list,
    sql_generation_reasoning: Optional[str],
    histories: list,
    project_id: str,
    sql_samples: list,
    instructions: list,
    retrieval_result: dict,
    allow_sql_functions_retrieval: bool,
    use_dry_plan: bool,
    allow_dry_plan_fallback: bool,
) -> dict:
    """Generate SQL from context."""
```

---

#### 6. `_correct_sql_with_retry()`
**Lines**: 498-543  
**Responsibility**: Validate and correct SQL  
**Returns**: `tuple[Optional[List[AskResult]], Optional[str], Optional[str]]`  
**Dependencies**: `sql_correction`

```python
async def _correct_sql_with_retry(
    self,
    invalid_result: dict,
    table_ddls: list,
    instructions: list,
    project_id: str,
    max_retries: int,
    use_dry_plan: bool,
    allow_dry_plan_fallback: bool,
    query_id: str,
    # For status updates:
    rephrased_question: Optional[str],
    intent_reasoning: Optional[str],
    table_names: list,
    sql_generation_reasoning: Optional[str],
    trace_id: str,
    is_followup: bool,
) -> tuple[Optional[List[AskResult]], Optional[str], Optional[str]]:
    """
    Correct invalid SQL with retry logic.
    
    Returns:
        (api_results, invalid_sql, error_message)
    """
```

---

#### 7. `_format_final_response()`
**Lines**: 545-580  
**Responsibility**: Format final response  
**Returns**: `dict`  
**Dependencies**: None (pure formatting)

```python
def _format_final_response(
    self,
    api_results: Optional[List[AskResult]],
    error_message: Optional[str],
    invalid_sql: Optional[str],
    request_from: str,
    query_id: str,
    rephrased_question: Optional[str],
    intent_reasoning: Optional[str],
    table_names: list,
    sql_generation_reasoning: Optional[str],
    trace_id: str,
    is_followup: bool,
) -> dict:
    """Format final response based on results."""
```

---

#### 8. `_update_status()`
**Helper Method** - Not in original, but should be extracted

```python
def _update_status(
    self,
    query_id: str,
    status: str,
    **kwargs,
) -> None:
    """Update query status in cache."""
    self._ask_results[query_id] = AskResultResponse(
        status=status,
        **kwargs,
    )
```

---

## 📋 Extraction Order (Recommended)

### Phase 1: Simple Extractions (Low Risk)
1. `_update_status()` - Helper method (NEW)
2. `_format_final_response()` - Pure function
3. `_retrieve_database_schemas()` - Single pipeline

**Benefit**: These are easy wins, build confidence

### Phase 2: Medium Complexity (Moderate Risk)
4. `_check_historical_question()` - 2 pipelines, clear boundary
5. `_generate_sql_reasoning()` - 2 pipelines, conditional
6. `_generate_sql()` - 3 pipelines, many params

**Benefit**: These have clear inputs/outputs

### Phase 3: Complex Extractions (Higher Risk)
7. `_classify_and_handle_intent()` - Multiple branches, async tasks
8. `_correct_sql_with_retry()` - Loop logic, many state updates

**Benefit**: Biggest impact on complexity reduction

### Phase 4: Refactor Main Method
9. Update `ask()` to orchestrate extracted methods

**Benefit**: Clean, readable, maintainable

---

## 🧪 Testing Strategy

### Current State
- Difficult to test individual sections
- Must mock 11 pipelines for full test
- Hard to test edge cases

### After Extraction
Each extracted method can be tested independently:

```python
# Example: Test cache hit
async def test_check_historical_question_cache_hit():
    mock_pipeline = Mock()
    mock_pipeline.run.return_value = {"formatted_output": {"documents": [...]}}
    
    service = AskService(pipelines={"historical_question": mock_pipeline})
    results, samples, instructions = await service._check_historical_question(
        "test query",
        "project-123",
    )
    
    assert results is not None
    assert len(results) == 1

# Example: Test cache miss
async def test_check_historical_question_cache_miss():
    # Test parallel retrieval
    ...
```

**Benefits**:
- Unit tests for each method
- Integration test for full flow
- Easy to test error cases
- Fast test execution

---

## 📊 Metrics Comparison

### Before Refactoring
| Metric | Value |
|--------|-------|
| Lines of Code | 470 |
| Cyclomatic Complexity | 20+ |
| Number of Parameters | 2 (but uses 15+ from request) |
| Number of Branches | 13 |
| Max Nesting Level | 5 |
| Number of Returns | 5 |
| Testability | Very Low |

### After Refactoring (Target)
| Metric | Current | Target | Improvement |
|--------|---------|--------|-------------|
| Lines of Code | 470 | < 100 | 78% reduction |
| Cyclomatic Complexity | 20+ | < 10 | 50%+ reduction |
| Method Count | 1 | 9 | Better separation |
| Avg Method Length | 470 | < 60 | 87% reduction |
| Testability | Very Low | High | Significant |

---

## 🎯 Success Criteria

### Code Quality
- ✅ Each extracted method < 60 lines
- ✅ Each extracted method < 10 cyclomatic complexity
- ✅ Clear single responsibility for each method
- ✅ Type hints for all parameters and returns
- ✅ Docstrings for all public methods

### Testing
- ✅ Unit tests for each extracted method (8 methods = 8+ test files)
- ✅ Integration test for full flow
- ✅ Test coverage > 90% for ask.py
- ✅ All edge cases covered

### Functionality
- ✅ All existing tests pass
- ✅ No behavior changes
- ✅ Same API contract
- ✅ Performance within 5% of current

---

## 📝 Next Steps (TASK-002)

After this analysis is complete:

1. **TASK-002**: Create comprehensive integration tests
   - Test full happy path (cache hit)
   - Test full happy path (no cache)
   - Test each intent type (MISLEADING, GENERAL, USER_GUIDE, TEXT_TO_SQL)
   - Test error cases (NO_RELEVANT_DATA, NO_RELEVANT_SQL)
   - Test SQL correction loop (1 retry, 2 retries, 3 retries, timeout)
   - Test stopped query handling
   - **Target**: 90%+ coverage of current behavior

2. **TASK-003**: Begin extraction starting with simplest methods
   - Start with `_update_status()` helper
   - Then `_format_final_response()`
   - Build momentum with easy wins

---

## 📚 References

- `.cursorrules` - Project standards
- `REFACTORING_PROPOSAL.md` - Overall strategy
- `REFACTORING_TODO.md` - Task tracking

---

**Analysis Complete**: ✅  
**Ready for**: TASK-002 (Integration Tests)  
**Estimated Refactoring Time**: 2-3 days for all extractions

---

**Reviewed By**: [To be filled]  
**Date**: [To be filled]



