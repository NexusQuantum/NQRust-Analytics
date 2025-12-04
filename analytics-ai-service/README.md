# Analytics AI Service

## Overview

The Analytics AI Service is the core AI component of NQRust-Analytics, responsible for converting natural language questions into SQL queries, generating insights, and providing intelligent data analysis capabilities.

## Key Features

- **Natural Language to SQL**: Convert questions to accurate SQL queries
- **Multi-LLM Support**: Works with OpenAI, Gemini, Claude, and more
- **RAG Pipeline**: Retrieval-Augmented Generation for context-aware responses
- **Semantic Understanding**: Leverages MDL (Modeling Definition Language) for accurate query generation
- **Extensible Architecture**: Plugin-based system for custom components

## Prerequisites

- **Python**: 3.12.x
- **Poetry**: 1.8.3 or higher
- **Just**: Command runner (v1.36+)
- **Docker**: For running dependent services (Qdrant, Analytics Engine)

## Installation

### 1. Install Python

We recommend using [pyenv](https://github.com/pyenv/pyenv) to manage Python versions:

```bash
pyenv install 3.12.7
pyenv local 3.12.7
```

### 2. Install Poetry

```bash
curl -sSL https://install.python-poetry.org | python3 - --version 1.8.3
```

### 3. Install Just

See [Just installation guide](https://github.com/casey/just#packages) for your platform.

### 4. Install Dependencies

```bash
poetry install
```

## Configuration

### 1. Generate Configuration Files

```bash
just init
```

This creates:
- `.env.dev` - Environment variables
- `config.yaml` - Service configuration

> **Windows Users**: Add `set shell:= ["bash", "-cu"]` at the start of the Justfile.

### 2. Configure Environment Variables

Edit `.env.dev` and set your LLM provider credentials:

```env
# OpenAI
OPENAI_API_KEY=your_api_key_here

# Or Azure OpenAI
AZURE_OPENAI_API_KEY=your_key
AZURE_OPENAI_ENDPOINT=your_endpoint

# Or Google Gemini
GOOGLE_API_KEY=your_key

# Or Anthropic Claude
ANTHROPIC_API_KEY=your_key
```

### 3. Configure Service Settings

Edit `config.yaml` to customize:
- LLM providers and models
- Embedding models
- Pipeline configurations
- Document stores
- Retrieval settings

See [Configuration Examples](./docs/config_examples/) for different LLM providers.

## Quick Start

### 1. Start Development Services

```bash
just up
```

This starts:
- Qdrant (vector database)
- Analytics Engine
- Ibis Server
- PostgreSQL (if configured)

### 2. Start AI Service

```bash
just start
```

### 3. Access Services

- **AI Service API**: http://localhost:5556
- **API Documentation**: http://localhost:5556/docs
- **Analytics UI**: http://localhost:3000 (if running)

### 4. Stop Services

```bash
just down
```

## Development Workflow

### Running Tests

```bash
just test
```

### Code Quality

```bash
# Install pre-commit hooks
poetry run pre-commit install

# Run all checks
poetry run pre-commit run --all-files
```

### Hot Reload

The service automatically reloads when you modify Python files during development.

## Configuration Examples

We provide configuration examples for various LLM providers:

- [OpenAI](./docs/config_examples/config.openai.yaml)
- [Azure OpenAI](./docs/config_examples/config.azure.yaml)
- [Google Gemini](./docs/config_examples/config.google_ai_studio.yaml)
- [Google Vertex AI](./docs/config_examples/config.google_vertexai.yaml)
- [Anthropic Claude](./docs/config_examples/config.anthropic.yaml)
- [AWS Bedrock](./docs/config_examples/config.bedrock.yaml)
- [DeepSeek](./docs/config_examples/config.deepseek.yaml)
- [Groq](./docs/config_examples/config.grok.yaml)
- [Ollama](./docs/config_examples/config.ollama.yaml)
- [And more...](./docs/config_examples/)

## Architecture

### Components

1. **LLM Provider**: Interfaces with various LLM APIs
2. **Embedder**: Generates vector embeddings for semantic search
3. **Document Store**: Stores and retrieves context (Qdrant)
4. **Pipelines**: Orchestrates the query processing flow
5. **Indexing**: Builds semantic indices from data schemas

### Pipeline Flow

```
User Question
    ↓
Retrieval (RAG)
    ↓
LLM Processing
    ↓
SQL Generation
    ↓
Query Execution
    ↓
Results + Insights
```

## Evaluation Framework

For evaluating and benchmarking the AI service performance, see:
- [Evaluation Framework Documentation](./eval/README.md)

## Available Commands (Just)

```bash
just init              # Initialize configuration files
just up                # Start development services
just down              # Stop development services
just start             # Start AI service
just test              # Run tests
just load-test         # Run load tests
just curate_eval_data  # Start evaluation data curation app
```

## Troubleshooting

### Service Won't Start

Check that all dependencies are running:

```bash
docker ps  # Verify Qdrant and other services are running
```

### LLM API Errors

- Verify API keys in `.env.dev`
- Check API rate limits
- Ensure correct model names in `config.yaml`

### Vector Store Connection Issues

Ensure Qdrant is running:

```bash
curl http://localhost:6333/health
```

## Performance Optimization

### Load Testing

To test service performance under load:

1. Configure test settings in `tests/locust/config_users.json`
2. Start services: `just up` and `just start`
3. Run load test: `just load-test`
4. Check reports in `outputs/locust/`

Reports include:
- `.json` - Test metrics and configuration
- `.html` - Visual charts and tables
- `.log` - Detailed test logs

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for:
- Development setup
- Code style guidelines
- Pull request process
- Adding new LLM providers
- Adding new embedders
- Adding new document stores

## License

See [LICENSE](../LICENSE) for details.
