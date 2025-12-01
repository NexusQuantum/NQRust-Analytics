# 🎯 Refactoring Documentation - Quick Access

## 📚 Dokumentasi Lengkap

Dokumentasi refactoring ini terdiri dari beberapa file yang saling melengkapi:

### 1. [.cursorrules](.cursorrules) - Project Guidelines ⭐
**📖 Baca Ini Pertama Kali!**

Berisi:
- Overview project Analytics AI
- Code style & standards
- Architecture patterns
- Anti-patterns yang harus dihindari
- Development workflow
- Commit message convention

**Kapan Digunakan**: Setiap kali menulis code baru atau review code.

---

### 2. [REFACTORING_PROPOSAL.md](REFACTORING_PROPOSAL.md) - Proposal Lengkap 📋
**📖 Baca untuk Memahami "Why" & "How"**

Berisi:
- Executive summary
- Current state analysis (masalah yang ada)
- Refactoring goals
- Detail implementasi untuk setiap priority
- Risk assessment
- Success criteria

**Kapan Digunakan**: 
- Saat mulai refactoring (baca dulu untuk konteks)
- Saat ada pertanyaan tentang design decision
- Saat membuat PR untuk menjelaskan konteks

---

### 3. [REFACTORING_TODO.md](REFACTORING_TODO.md) - Task List ✅
**📖 Baca Setiap Hari untuk Tracking Progress**

Berisi:
- 64 tasks terstruktur
- Progress tracking per priority
- Milestones
- Metrics tracking table
- Blockers & issues

**Kapan Digunakan**:
- Setiap pagi: pilih task berikutnya
- Setelah selesai task: update checklist
- End of week: update metrics
- Daily standup: report progress

**‼️ PENTING**: File ini harus **SELALU DIUPDATE** setiap ada progress!

---

### 4. [REFACTORING_GUIDE.md](REFACTORING_GUIDE.md) - Panduan Praktis 🚀
**📖 Baca untuk Cara Kerja Sehari-hari**

Berisi:
- Quick start setup
- Daily workflow
- Testing guidelines
- Common patterns & examples
- Common pitfalls
- Debugging tips

**Kapan Digunakan**:
- Saat setup environment pertama kali
- Saat stuck dan perlu contoh pattern
- Saat debug masalah
- Reference untuk best practices

---

## 🎯 Alur Kerja Refactoring

```
┌─────────────────────────────────────────────────────────┐
│ 1. SETUP (Sekali di Awal)                              │
│    📖 Baca: .cursorrules + REFACTORING_PROPOSAL.md     │
│    🛠️  Action: Setup environment (REFACTORING_GUIDE)   │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 2. DAILY WORK (Setiap Hari)                            │
│    📋 Check: REFACTORING_TODO.md → pilih task         │
│    🔨 Work: Ikuti pattern di REFACTORING_GUIDE        │
│    ✅ Done: Update REFACTORING_TODO.md                │
└─────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────┐
│ 3. REVIEW (Sebelum PR)                                 │
│    📏 Check: .cursorrules → standards                  │
│    📊 Metrics: Run `just refactor-check`               │
│    📝 PR: Link ke task di REFACTORING_TODO.md         │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start Guide

### First Time Setup

```bash
# 1. Baca dokumentasi ini
cat README_REFACTORING.md

# 2. Baca project rules
cat .cursorrules

# 3. Skim proposal (untuk konteks)
cat REFACTORING_PROPOSAL.md

# 4. Setup environment (ikuti REFACTORING_GUIDE)
cd analytics-ai-service
just init
just install-dev
just up
just start

# 5. Verify setup
just test
```

### Daily Workflow

```bash
# Morning: Check TODO
cat REFACTORING_TODO.md | grep "\\[ \\]" | head -1

# Work on task (refer to REFACTORING_GUIDE for patterns)
# ...

# Before commit: Update TODO
vim REFACTORING_TODO.md  # Mark task as done

# Commit
git commit -m "refactor(service): extract method [TASK-XXX]"
```

---

## 📊 Progress Tracking

### Current Status

- **Overall Progress**: 0/64 tasks (0%)
- **Priority 1**: 0/30 tasks
- **Priority 2**: 0/22 tasks
- **Current Week**: Week 1
- **Current Focus**: Setup & Planning

### Where to Track

📍 **All tracking happens in**: `REFACTORING_TODO.md`

Update these sections:
- `## 📊 Progress Overview` - Overall numbers
- Task checkboxes: `- [ ]` → `- [x]`
- `## 📊 Metrics Tracking` - Weekly metrics
- `## 💡 Notes & Learnings` - Lessons learned

---

## 🛠️ Key Commands

```bash
# Code Quality Checks
just check-all              # Run all checks (format, lint, type)
just refactor-check         # Check refactoring guidelines
just refactor-report        # Generate metrics report

# Testing
just test                   # Run tests
just test-cov               # Run with coverage
just test-watch             # Watch mode for TDD

# Metrics
just metrics                # Show all metrics
just metrics-complexity     # Complexity only

# Development
just start                  # Start service
just up                     # Start dependencies
just clean                  # Clean cache files
```

---

## 🎨 Architecture Overview (dari diagram)

```
User Query
    ↓
┌─────────────────────────────────┐
│  1. INDEX PROCESSING            │
│  ├─ Rewriter (MDL → DDL)       │
│  └─ Vector Database (Qdrant)    │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  2. RAG PIPELINE                │
│  ├─ Retrieval (Get Context)    │
│  ├─ Prompt (Query + Context)    │
│  └─ LLM (Generate SQL)          │
└─────────────────────────────────┘
    ↓
┌─────────────────────────────────┐
│  3. OUTPUT PROCESSING           │
│  ├─ Validation (Analytics Engine)   │
│  └─ Correction (Feedback Loop)  │
└─────────────────────────────────┘
    ↓
SQL Result
```

**Yang Akan Direfactor**:
- Service Layer (AskService) - Orchestration
- Pipeline Construction (globals.py) - Dependency Injection
- Pipeline Base Classes - Abstraction & Type Safety

---

## 🎯 Priorities Summary

### ⭐ Priority 1 (Critical) - Week 1-4

1. **Extract Methods from AskService** (Week 1-2)
   - Problem: 656 lines, god object
   - Solution: Extract 8-10 smaller methods
   - Impact: 🔴 High

2. **Builder Pattern for ServiceContainer** (Week 3)
   - Problem: 255 lines procedural code
   - Solution: Implement builder pattern
   - Impact: 🟡 Medium

3. **Strengthen Pipeline Abstraction** (Week 4)
   - Problem: Weak interface, no validation
   - Solution: Generic types + Pydantic validation
   - Impact: 🟡 Medium

### ⭐ Priority 2 (Important) - Week 5-6

4. **Custom Exception Hierarchy** (Week 5)
   - Problem: Inconsistent error handling
   - Solution: Custom exception classes
   - Impact: 🟡 Medium

5. **Centralized Configuration** (Week 5)
   - Problem: Config scattered everywhere
   - Solution: Nested Pydantic models
   - Impact: 🟢 Low

6. **Extract Prompt Templates** (Week 6)
   - Problem: Prompts hardcoded in code
   - Solution: Jinja2 templates in separate files
   - Impact: 🟢 Low

---

## ✅ Definition of Done

Untuk setiap task dianggap selesai jika:

- [x] Code direfactor sesuai design
- [x] All tests pass (old + new)
- [x] No linting errors (`just lint`)
- [x] No type errors (`just typecheck`)
- [x] Test coverage maintained or improved
- [x] `REFACTORING_TODO.md` updated
- [x] PR created & reviewed
- [x] Changes merged to main branch

---

## 🆘 Need Help?

### Quick References
- **Style question**: Check `.cursorrules`
- **Pattern question**: Check `REFACTORING_GUIDE.md`
- **Task unclear**: Check `REFACTORING_PROPOSAL.md`
- **Progress tracking**: Update `REFACTORING_TODO.md`

### Debug Issues
```bash
# Tests failing
pytest -vv --pdb tests/pytest/...

# Type errors
mypy --show-error-codes src/

# Performance
just refactor-report
```

### Contact
- Team Channel: [Link to channel]
- GitHub Issues: [Link to repo]

---

## 📅 Timeline

| Week | Focus Area | Deliverable |
|------|------------|-------------|
| 1-2  | AskService methods | ✨ M1: AskService Refactored |
| 3    | Builder pattern | ✨ M2: Builder Implemented |
| 4    | Pipeline abstraction | ✨ M3: Pipeline Abstraction |
| 5    | Exceptions & Config | ✨ M4: Priority 2 Complete |
| 6    | Prompts & Polish | ✨ M5: Production Ready |

---

## 🔄 Docker Setup (Local Build)

**✅ SUDAH DIUPDATE!**

Docker Compose sekarang menggunakan local build:

```yaml
# docker-compose-demo.yaml
analytics-ai-service:
  build:
    context: ./analytics-ai-service
    dockerfile: docker/Dockerfile
  # image: ghcr.io/canner/analytics-ai-service:0.27.1  # OLD - commented out
```

**Build dan run**:
```bash
# Build dari source local
docker-compose -f docker-compose-demo.yaml up --build

# Atau gunakan Justfile
cd analytics-ai-service
just build        # Build Docker image
just run-docker   # Run container
```

**Benefits**:
- ✅ Code changes langsung ter-reflect
- ✅ Tidak perlu download image dari registry
- ✅ Development lebih cepat

---

## 📝 Key Files Modified

Refactoring ini menambahkan/memodifikasi file berikut:

### ✨ New Files (Dokumentasi)
- `.cursorrules` - Project guidelines
- `REFACTORING_PROPOSAL.md` - Detail proposal
- `REFACTORING_TODO.md` - Task tracking
- `REFACTORING_GUIDE.md` - Praktis guide
- `README_REFACTORING.md` - This file (overview)

### 🔧 Modified Files (Setup)
- `docker-compose-demo.yaml` - Local build setup
- `docker/docker-compose.yaml` - Local build setup
- `analytics-ai-service/Justfile` - Enhanced commands
- `.gitignore` - Add refactoring reports

### 📦 Future Files (Akan dibuat saat refactoring)
- `src/core/builder.py` - ServiceContainerBuilder
- `src/core/exceptions.py` - Exception hierarchy
- `src/prompts/` - Prompt templates directory
- `tests/pytest/core/test_builder.py` - Builder tests

---

## 🎓 Learning Path

### Untuk Developer Baru

1. **Day 1: Understanding**
   - ✅ Read this file (README_REFACTORING.md)
   - ✅ Read .cursorrules
   - ✅ Skim REFACTORING_PROPOSAL.md

2. **Day 2: Setup**
   - ✅ Follow setup in REFACTORING_GUIDE.md
   - ✅ Run `just test` to verify
   - ✅ Explore codebase

3. **Day 3: First Task**
   - ✅ Pick TASK-001 from REFACTORING_TODO.md
   - ✅ Follow patterns in REFACTORING_GUIDE.md
   - ✅ Complete and update TODO

4. **Week 1+: Regular Work**
   - ✅ Daily: Check TODO, work, update
   - ✅ Weekly: Update metrics
   - ✅ Continuous: Learn and improve

---

## 📊 Success Metrics

Track these in `REFACTORING_TODO.md`:

| Metric | Baseline | Target | How to Measure |
|--------|----------|--------|----------------|
| Avg Function Length | 150 | < 50 | `just metrics-complexity` |
| Test Coverage | 60% | > 80% | `just test-cov` |
| Type Coverage | 70% | > 95% | `just typecheck` |
| Cyclomatic Complexity | 25 | < 10 | `just metrics-complexity` |
| Code Duplication | 15% | < 5% | `pylint --enable=duplicate-code` |

---

## 🎉 Let's Start!

**Next Steps**:

1. ✅ Read `.cursorrules` (5 min)
2. ✅ Setup environment with `REFACTORING_GUIDE.md` (30 min)
3. ✅ Pick first task from `REFACTORING_TODO.md` (TASK-001)
4. ✅ Start refactoring! 🚀

**Remember**:
- 📋 Always update `REFACTORING_TODO.md`
- 📏 Follow `.cursorrules` standards
- 🧪 Write tests first (TDD)
- 💬 Ask when stuck

**Good luck! 🎉**

---

**Document Version**: 1.0  
**Last Updated**: October 3, 2025  
**Status**: ✅ Ready to Use

---

## 📞 Quick Links

- 📏 [.cursorrules](.cursorrules) - Standards & Guidelines
- 📋 [REFACTORING_PROPOSAL.md](REFACTORING_PROPOSAL.md) - Full Proposal
- ✅ [REFACTORING_TODO.md](REFACTORING_TODO.md) - Task Tracking ⭐ **Update This Daily!**
- 🚀 [REFACTORING_GUIDE.md](REFACTORING_GUIDE.md) - Practical Guide
- 🏗️ [analytics-ai-service/docs/code_design.md](analytics-ai-service/docs/code_design.md) - Architecture

---

**Happy Refactoring! 🎨**




