# 🚀 Analytics AI Service - Refactoring Guide

**Quick Reference**: Panduan praktis untuk memulai refactoring

---

## 📚 Dokumen Terkait

| Dokumen | Deskripsi | Kapan Digunakan |
|---------|-----------|-----------------|
| `.cursorrules` | Project guidelines dan best practices | Saat menulis code baru |
| `REFACTORING_PROPOSAL.md` | Proposal lengkap refactoring | Untuk memahami "why" dan desain |
| `REFACTORING_TODO.md` | Task list yang terupdate | Daily tracking dan checklist |
| `REFACTORING_GUIDE.md` | Panduan praktis (ini) | Saat mulai bekerja |

---

## 🏃 Quick Start

### 1. Setup Development Environment

```bash
# Clone dan masuk ke project
cd analytics-ai-service

# Install dependencies
poetry install

# Copy environment variables
cp .env.dev.example .env.dev

# Edit .env.dev dan tambahkan API keys
# OPENAI_API_KEY=your-key-here

# Generate config
just init

# Start dependencies (Qdrant, dll)
just up

# Run tests untuk memastikan setup OK
just test

# Start AI service
just start
```

### 2. Build dengan Docker (Local Build)

Docker compose sudah diupdate untuk build dari source local:

```bash
# Build dan start semua services
docker-compose -f docker-compose-demo.yaml up --build

# Atau untuk production config
docker-compose -f docker/docker-compose.yaml up --build
```

**Perubahan**:
- ✅ `analytics-ai-service` sekarang build dari `./analytics-ai-service` (local)
- ✅ Tidak lagi download image dari `ghcr.io/canner/analytics-ai-service`
- ✅ Code changes langsung ter-reflect setelah rebuild

### 3. Verify Setup

```bash
# Check service health
curl http://localhost:5555/health

# Expected response:
# {"status":"ok"}

# Check API docs
open http://localhost:5555/docs
```

---

## 📖 Daily Workflow

### Morning Routine

1. **Update local branch**
   ```bash
   git checkout skinning-v1-rust-color-and-rounded
   git pull origin skinning-v1-rust-color-and-rounded
   ```

2. **Cek TODO list**
   - Buka `REFACTORING_TODO.md`
   - Cari task berikutnya yang belum dikerjakan
   - Update status ke "In Progress"

3. **Buat feature branch**
   ```bash
   git checkout -b refactor/task-001-analyze-ask-method
   ```

4. **Start working**
   ```bash
   # Terminal 1: Run tests in watch mode
   just test-watch
   
   # Terminal 2: Start service
   just start
   ```

### During Work

1. **Write test first** (TDD)
   ```python
   # tests/pytest/services/test_ask_service.py
   
   async def test_check_historical_question_returns_cached_result():
       # Arrange
       service = AskService(...)
       request = AskRequest(query="test query")
       
       # Act
       result = await service._check_historical_question(request)
       
       # Assert
       assert result is not None
       assert result.sql == "SELECT ..."
   ```

2. **Implement code**
   ```python
   # src/web/v1/services/ask.py
   
   async def _check_historical_question(
       self, 
       request: AskRequest
   ) -> Optional[CachedResult]:
       """Check if question exists in cache."""
       # Implementation
   ```

3. **Run checks**
   ```bash
   # Format code
   just format
   
   # Lint
   just lint
   
   # Type check
   just typecheck
   
   # Tests
   just test
   ```

### Before Commit

1. **Update TODO list**
   ```markdown
   # REFACTORING_TODO.md
   
   - [x] **TASK-001**: Analyze current ask() method
     - ✅ Completed on: 2025-10-04
     - 📝 Notes: Found 8 main sections
   ```

2. **Run all checks**
   ```bash
   just check-all
   ```

3. **Commit with convention**
   ```bash
   git add .
   git commit -m "refactor(service): extract _check_historical_question method

   - Extract historical question check logic from ask()
   - Add unit tests
   - Update integration tests
   
   Task: TASK-004
   "
   ```

4. **Push dan create PR**
   ```bash
   git push origin refactor/task-004-extract-historical-check
   
   # Create PR on GitHub
   # Title: [TASK-004] Extract _check_historical_question from AskService
   # Description: Link to REFACTORING_TODO.md task
   ```

---

## 🎯 Refactoring Checklist

Untuk setiap refactoring task, ikuti checklist ini:

### ✅ Before Starting
- [ ] Baca task description di `REFACTORING_TODO.md`
- [ ] Pahami code yang akan direfactor
- [ ] Update task status ke "In Progress"
- [ ] Buat feature branch

### ✅ During Refactoring
- [ ] Write tests first (jika belum ada)
- [ ] Refactor code tanpa mengubah logic
- [ ] Run tests frequently
- [ ] Check type hints dengan mypy
- [ ] Check linting dengan ruff

### ✅ After Refactoring
- [ ] All tests pass
- [ ] No linting errors
- [ ] No type errors
- [ ] Code coverage maintained or improved
- [ ] Update TODO list
- [ ] Commit dengan conventional commit message
- [ ] Create PR

---

## 🧪 Testing Guidelines

### Test Structure

```
tests/pytest/
├── services/           # Service layer tests
│   ├── test_ask_service.py
│   └── test_ask_service_integration.py
├── pipelines/          # Pipeline tests
│   ├── generation/
│   └── retrieval/
└── core/               # Core component tests
    └── test_builder.py
```

### Test Types

#### 1. Unit Tests
```python
# Test individual methods in isolation

async def test_check_historical_question_with_cache_hit(mocker):
    # Mock dependencies
    mock_pipeline = mocker.Mock()
    mock_pipeline.run.return_value = {"result": "..."}
    
    service = AskService(pipelines={"historical_question": mock_pipeline})
    result = await service._check_historical_question(request)
    
    assert result is not None
```

#### 2. Integration Tests
```python
# Test full flow with real dependencies (but mocked external APIs)

async def test_ask_full_flow_success(mock_llm, mock_qdrant):
    service = create_service_with_mocks(mock_llm, mock_qdrant)
    result = await service.ask(request)
    
    assert result["status"] == "finished"
    assert "sql" in result
```

#### 3. Property-Based Tests (Advanced)
```python
from hypothesis import given, strategies as st

@given(query=st.text(min_size=1, max_size=100))
async def test_ask_never_crashes(query):
    result = await service.ask(AskRequest(query=query))
    assert result is not None
```

### Running Tests

```bash
# All tests
just test

# Specific test file
pytest tests/pytest/services/test_ask_service.py

# Specific test function
pytest tests/pytest/services/test_ask_service.py::test_check_historical_question

# With coverage
pytest --cov=src --cov-report=html

# Open coverage report
open htmlcov/index.html
```

---

## 🔍 Common Patterns

### Pattern 1: Extract Method

**Before**:
```python
async def ask(self, request):
    # 50 lines of logic A
    
    # 50 lines of logic B
    
    # 50 lines of logic C
```

**After**:
```python
async def ask(self, request):
    result_a = await self._logic_a(request)
    result_b = await self._logic_b(result_a)
    result_c = await self._logic_c(result_b)
    return result_c

async def _logic_a(self, request):
    # 50 lines of logic A
    return result

async def _logic_b(self, result_a):
    # 50 lines of logic B
    return result

async def _logic_c(self, result_b):
    # 50 lines of logic C
    return result
```

### Pattern 2: Replace Conditional with Polymorphism

**Before**:
```python
if intent == "MISLEADING_QUERY":
    # Handle misleading
elif intent == "GENERAL":
    # Handle general
elif intent == "USER_GUIDE":
    # Handle user guide
```

**After**:
```python
class IntentHandler(ABC):
    @abstractmethod
    async def handle(self, request):
        pass

class MisleadingQueryHandler(IntentHandler):
    async def handle(self, request):
        # Handle misleading

class GeneralQueryHandler(IntentHandler):
    async def handle(self, request):
        # Handle general

# Usage
handler = intent_handler_factory(intent)
result = await handler.handle(request)
```

### Pattern 3: Builder Pattern

**Before**:
```python
service = MyService(
    pipeline1=create_pipeline1(...),
    pipeline2=create_pipeline2(...),
    setting1=value1,
    setting2=value2,
)
```

**After**:
```python
service = (
    MyServiceBuilder()
    .with_pipelines(pipelines)
    .with_settings(settings)
    .build()
)
```

---

## 🚨 Common Pitfalls

### ❌ Don't: Change Logic During Refactoring

```python
# BAD: Adding new feature during refactoring
async def _generate_sql(self, request):
    # Refactored code
    if request.use_new_algorithm:  # ❌ New feature!
        return await self._new_algo()
    return await self._old_algo()
```

```python
# GOOD: Only refactor structure
async def _generate_sql(self, request):
    # Exact same logic, just extracted
    return await self._pipelines["sql_generation"].run(...)
```

### ❌ Don't: Break API Contracts

```python
# BAD: Changing return type
async def ask(self, request) -> dict:  # Was dict
    return AskResponse(...)  # ❌ Now returns object

# GOOD: Keep same interface
async def ask(self, request) -> dict:  # Still dict
    response = self._internal_ask(request)  # Internal can change
    return response.to_dict()  # But external stays same
```

### ❌ Don't: Skip Tests

```python
# BAD: Just refactor and hope it works
# ❌ No tests written

# GOOD: Write tests first
def test_extracted_method():
    assert extracted_method(input) == expected_output

# Then refactor
```

---

## 📊 Metrics to Track

### Weekly Metrics

Run this every Friday:

```bash
# Create metrics report
just metrics > reports/metrics-week-$(date +%V).txt

# Or manual
radon cc src/ -s > metrics-complexity.txt
pytest --cov=src --cov-report=term > metrics-coverage.txt
mypy src/ --txt-report metrics-types/
```

### Tracking Progress

Update `REFACTORING_TODO.md` metrics table:

```markdown
| Metric | Week 1 | Week 2 | Week 3 |
|--------|--------|--------|--------|
| Avg Function Length | 148 | 120 | 95 |
| Test Coverage | 62% | 68% | 74% |
```

---

## 🆘 Getting Help

### Debug Issues

1. **Tests failing after refactor**
   ```bash
   # Run with verbose output
   pytest -vv tests/pytest/services/test_ask_service.py
   
   # Run with debugger
   pytest --pdb tests/pytest/services/test_ask_service.py
   ```

2. **Type errors**
   ```bash
   # Show detailed errors
   mypy --show-error-codes --show-error-context src/
   ```

3. **Performance regression**
   ```bash
   # Profile code
   python -m cProfile -o profile.stats src/__main__.py
   
   # Analyze
   python -c "import pstats; p = pstats.Stats('profile.stats'); p.sort_stats('cumtime'); p.print_stats(20)"
   ```

### Questions

- Check `.cursorrules` for guidelines
- Check `REFACTORING_PROPOSAL.md` for design decisions
- Ask in team channel
- Create issue in GitHub

---

## 🎓 Learning Resources

### Project Specific

1. **Code Architecture**
   - Read: `analytics-ai-service/docs/code_design.md`
   - Understand: Pipeline → Service → Router flow

2. **Configuration**
   - Read: `analytics-ai-service/docs/configuration.md`
   - Learn: How to configure LLM providers

3. **Testing**
   - Check: `tests/pytest/` for examples
   - Pattern: Unit tests + Integration tests

### External Resources

#### Refactoring
- 📖 [Refactoring Guru](https://refactoring.guru/) - Patterns and examples
- 📖 [Martin Fowler's Refactoring](https://martinfowler.com/books/refactoring.html)

#### Python Best Practices
- 📖 [FastAPI Best Practices](https://github.com/zhanymkanov/fastapi-best-practices)
- 📖 [Python Type Hints](https://docs.python.org/3/library/typing.html)

#### Testing
- 📖 [Pytest Documentation](https://docs.pytest.org/)
- 📖 [Test-Driven Development](https://testdriven.io/)

---

## 🎉 Success Criteria

### You're Done When...

For each task:
- ✅ Code refactored
- ✅ Tests pass (old + new)
- ✅ No linting errors
- ✅ No type errors
- ✅ Coverage maintained
- ✅ TODO list updated
- ✅ PR created and reviewed
- ✅ Changes merged

For overall refactoring:
- ✅ All Priority 1 tasks done
- ✅ All Priority 2 tasks done
- ✅ Test coverage > 80%
- ✅ Type coverage > 95%
- ✅ Deployed to production
- ✅ No regressions reported

---

## 📅 Timeline Summary

| Week | Focus | Milestone |
|------|-------|-----------|
| 1-2 | Extract AskService methods | ✨ M1: AskService Refactored |
| 3 | Implement Builder Pattern | ✨ M2: Builder Implemented |
| 4 | Strengthen Pipeline Abstraction | ✨ M3: Pipeline Abstraction |
| 5 | Exception Hierarchy + Config | ✨ M4: Priority 2 Complete |
| 6 | Prompt Extraction + Polish | ✨ M5: Production Ready |

---

**Last Updated**: October 3, 2025  
**Maintained By**: Development Team

**Quick Links**:
- 📋 [TODO List](REFACTORING_TODO.md)
- 📄 [Proposal](REFACTORING_PROPOSAL.md)
- 📏 [Rules](.cursorrules)
- 🏗️ [Architecture](analytics-ai-service/docs/code_design.md)


