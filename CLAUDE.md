# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Analytics AI is an open-source GenBI (Generative Business Intelligence) agent that allows users to query databases with natural language to get accurate SQL, charts, and AI-generated insights. The system consists of multiple components working together:

- **analytics-ai-service**: Python FastAPI backend service that handles NLP to SQL conversion using RAG pipelines
- **analytics-ui**: Next.js frontend application providing the user interface
- **analytics-engine**: Data processing engine (separate component)
- **analytics-launcher**: Go-based launcher utility

## Development Commands

### analytics-ai-service (Python/FastAPI)
```bash
cd analytics-ai-service

# Setup (requires Python >=3.12, <3.13)
poetry install
just init  # Creates config.yaml and .env.dev from examples

# Development
just start                    # Start the service
just up                      # Start with Docker dependencies
just down                    # Stop Docker dependencies

# Testing
just test                    # Run pytest tests
just test-usecases          # Run use case tests
just load-test              # Run load tests with Locust

# Code quality
ruff check                  # Lint Python code
ruff format                 # Format Python code
ruff check --fix           # Auto-fix linting issues
```

### analytics-ui (Next.js/TypeScript)
```bash
cd analytics-ui

# Setup
yarn install

# Development
yarn dev                    # Start development server
yarn build                 # Build for production
yarn start                 # Start production server

# Testing
yarn test                   # Run Jest tests
yarn test:e2e              # Run Playwright E2E tests

# Code quality
yarn lint                   # Run ESLint and TypeScript checks
yarn check-types           # TypeScript type checking

# Database
yarn migrate               # Run database migrations
yarn rollback             # Rollback migrations

# Code generation
yarn generate-gql         # Generate GraphQL types
```

### analytics-launcher (Go)
```bash
cd analytics-launcher

# Development
make build                 # Build for all platforms
make test                  # Run Go tests
make lint                  # Run golangci-lint
make fmt                   # Format Go code
make check                 # Run fmt, vet, and lint
```

### Docker Development
```bash
# From project root
docker compose -f docker/docker-compose-dev.yaml up -d
docker compose -f docker/docker-compose.yaml up -d
```

## Architecture

### analytics-ai-service Architecture
The Python service follows a layered architecture with four main concepts:

1. **API Endpoints** (`src/web/v1/routers/`): FastAPI REST endpoints that serve as entry points
2. **Services** (`src/web/v1/services/`): Business logic layer that orchestrates pipelines
3. **Pipelines** (`src/pipelines/`): RAG (Retrieval-Augmented Generation) implementations
   - `indexing/`: Data indexing pipelines
   - `generation/`: Text-to-SQL and response generation
   - `retrieval/`: Context retrieval systems
4. **Providers** (`src/providers/`): External service integrations
   - `llm/`: LLM integrations (OpenAI, Azure, Anthropic, etc.)
   - `embedder/`: Embedding model providers
   - `document_store/`: Vector database (Qdrant)
   - `engine/`: Data engine connections

### analytics-ui Architecture
The frontend is a Next.js application with:

- **Apollo GraphQL**: Client-server communication (`src/apollo/`)
- **Page Components**: Main application pages (`src/pages/`)
- **Reusable Components**: UI components (`src/components/`)
- **Services**: GraphQL resolvers and business logic (`src/apollo/server/`)
- **Database**: PostgreSQL with Knex.js migrations (`migrations/`)

## Key Configuration Files

- `analytics-ai-service/config.yaml`: Main AI service configuration (LLM providers, embedders, etc.)
- `analytics-ai-service/.env.dev`: Development environment variables  
- `analytics-ui/knexfile.js`: Database configuration
- `docker/config.example.yaml`: Docker configuration template

## Testing Strategy

- **Python**: pytest with async support, mocking, and coverage
- **JavaScript**: Jest for unit tests, Playwright for E2E tests
- **Load Testing**: Locust for performance testing
- **Integration**: Docker-based testing environment

## Data Flow

1. User submits natural language query through analytics-ui
2. Frontend sends GraphQL request to analytics-ui backend
3. analytics-ui makes REST API calls to analytics-ai-service
4. analytics-ai-service processes query through RAG pipelines:
   - Retrieves relevant schema/context from vector store
   - Generates SQL using LLM with retrieved context
   - Validates SQL against target database
5. Results flow back through the stack to the user interface

## Development Notes

- The system supports multiple LLM providers configurable per pipeline
- MDL (Modeling Definition Language) is used for semantic layer definitions
- Vector embeddings are stored in Qdrant for context retrieval
- Background tasks handle long-running operations with polling-based status updates
- Telemetry and tracing integrated with Langfuse for observability