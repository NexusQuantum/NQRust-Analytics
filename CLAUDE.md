# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

NQRust-Analytics is a multi-service analytics platform that converts natural language to SQL, executes queries, and generates visualizations. Four main components:

1. **analytics-ui** (Next.js/TypeScript, port 3000) — Web frontend + GraphQL API server + database migrations
2. **analytics-ai-service** (Python/FastAPI, port 5555) — NLP/LLM pipeline for text-to-SQL via RAG
3. **analytics-engine** (Rust/DataFusion + Python Ibis, port 8080) — Semantic query planning and execution; git submodule
4. **analytics-launcher** (Go) — CLI deployment wizard; cross-platform binary

**Request flow:** UI → AI Service (intent classification, schema retrieval via Qdrant, SQL generation via LLM) → Analytics Engine (MDL semantic processing, DataFusion SQL planning) → Data source → back through for chart/summary generation → UI.

**Metadata storage:** SQLite (local dev) or PostgreSQL (production), managed by Knex.js migrations in `analytics-ui/migrations/`.
**Vector storage:** Qdrant (port 6333) — stores embeddings for RAG (table/column descriptions, historical SQL pairs, instructions).
**LLM abstraction:** LiteLLM in the AI service supports 100+ providers; configured via `config.yaml`.

## Commands

### Analytics UI (Next.js)
```bash
cd analytics-ui
yarn dev          # Dev server on port 3000
yarn build        # Production build
yarn test         # Jest unit tests
yarn test:e2e     # Playwright E2E tests
yarn lint         # TypeScript + ESLint
yarn migrate      # Run Knex migrations (requires DB_TYPE and PG_URL env vars for PostgreSQL)
yarn rollback     # Rollback last migration
```

### Analytics AI Service (Python)
```bash
cd analytics-ai-service
just init         # Initialize config
just start        # Start FastAPI service (port 5555)
just test         # Run pytest
just up           # Start Docker dependencies (Qdrant, Engine)
just down         # Stop Docker dependencies
```
Python 3.12 is required (strict). Dependencies managed by Poetry.

### Analytics Engine (Rust/Python submodule)
```bash
cd analytics-engine
cargo build       # Build Rust core
cargo test        # Run tests
# Python ibis-server
pip install -e .
python -m ibis_server
```

### Analytics Launcher (Go)
```bash
cd analytics-launcher
make build        # Build for all platforms (darwin/linux/windows, x64/arm64)
make test         # Go tests
make lint         # golangci-lint
make fmt          # go fmt
```

### Full Stack (Docker Compose)
```bash
docker compose up -d   # Start all services
docker compose down    # Stop all services
```

## Key Patterns

### Database Migrations (analytics-ui)
- Migrations live in `analytics-ui/migrations/`, run via Knex.js
- For SQLite (default): no extra env vars needed
- For PostgreSQL: `DB_TYPE=pg PG_URL=postgres://... yarn migrate`
- Schema covers: users/RBAC, projects, models, metrics, relationships, threads, dashboards

### GraphQL + REST Split
- UI components use Apollo Client → GraphQL endpoint at `/api/graphql`
- External integrations use REST at `/api/v1/*`
- AI service exposes REST only (FastAPI auto-generates OpenAPI docs at `/docs`)

### RAG Pipeline (analytics-ai-service)
- 40+ pipelines in `src/web/v1/routers/`; each pipeline = intent → retrieval → LLM call → validation
- Pipeline config in `config.yaml` (LLM provider, embedding model, Qdrant collections)
- Langfuse integration for tracing/cost observability

### MDL (Modeling Definition Language)
- Semantic layer definitions stored in `analytics-mdl/` and in the project database
- The Analytics Engine interprets MDL to understand table relationships before executing SQL
- Models/relationships defined via the UI modeling interface or YAML files

## Configuration
- `config.yaml` — LLM provider, embedding model, pipeline settings (root of repo)
- `docker-compose.yaml` / `docker/.env` — service ports, `JWT_SECRET`, `PG_URL`, `OPENAI_API_KEY`
- `analytics-ai-service/ruff.toml` — Python linting rules
- `analytics-engine/rustfmt.toml` — Rust formatting rules
