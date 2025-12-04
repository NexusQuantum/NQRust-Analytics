# Docker Services Documentation

## Overview

NQRust-Analytics uses Docker Compose to orchestrate multiple services for the complete analytics platform.

## Services

### Core Services

- **analytics-engine** - Query execution engine
  - Processes MDL (Modeling Definition Language)
  - Executes SQL queries across multiple data sources
  - Provides semantic layer for consistent data access
  - [Example configurations](https://github.com/NexusQuantum/analytics-engine/tree/main/example)

- **analytics-ai-service** - AI-powered natural language processing
  - Converts natural language to SQL
  - Generates insights and recommendations
  - Handles LLM interactions

- **analytics-ui** - Web-based user interface
  - Dashboard creation and management
  - Data source configuration
  - Query builder and visualization

- **ibis-server** - Data connectivity layer
  - Multi-database connector
  - Query translation and optimization

- **qdrant** - Vector database
  - Stores embeddings for RAG (Retrieval-Augmented Generation)
  - Enables semantic search capabilities

- **bootstrap** - Initialization service
  - Sets up required files and configurations
  - Prepares data volumes

## Data Volumes

Shared data is stored in the `data` volume with the following structure:

```
/mdl/
  ├── *.json          # MDL model definitions
/accounts/            # User account data
config.properties     # Service configurations
```

## Network

All services communicate via the `analytics` bridge network. See [Docker Network Drivers](https://docs.docker.com/engine/network/drivers/) for more information.

## Quick Start

### Prerequisites

- Docker Engine 20.10+
- Docker Compose V2
- Minimum 4GB RAM
- 10GB free disk space

### Starting with OpenAI

1. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

2. **Configure API keys**
   Edit `.env` and set your OpenAI API key:
   ```env
   OPENAI_API_KEY=your_api_key_here
   ```

3. **Copy AI service configuration**
   ```bash
   cp config.example.yaml config.yaml
   ```

4. **Start all services**
   ```bash
   docker-compose --env-file .env up -d
   ```

5. **Stop services**
   ```bash
   docker-compose --env-file .env down
   ```

### Port Configuration

If port 3000 is already in use, modify `HOST_PORT` in `.env`:

```env
HOST_PORT=8080  # Change to your preferred port
```

## Using Custom LLM Providers

To use a different LLM provider (Azure OpenAI, Gemini, Claude, etc.):

1. **Modify `config.yaml`**
   Update the LLM provider settings according to your chosen provider

2. **Restart AI service**
   ```bash
   docker-compose --env-file .env up -d --force-recreate analytics-ai-service
   ```

### Configuration Examples

For detailed configuration examples for different LLM providers, see:
- [AI Service Configuration Guide](../analytics-ai-service/docs/configuration.md)
- [Configuration Examples](../analytics-ai-service/docs/config_examples/)

Supported providers:
- OpenAI / Azure OpenAI
- Google Gemini (AI Studio & Vertex AI)
- Anthropic Claude
- AWS Bedrock
- Groq
- Ollama (local models)
- DeepSeek
- And more...

## Service URLs

After starting, access the services at:

- **Analytics UI**: http://localhost:3000
- **AI Service API**: http://localhost:5556
- **Analytics Engine**: http://localhost:8080
- **Ibis Server**: http://localhost:8000

## Troubleshooting

### Services won't start

Check Docker logs:
```bash
docker-compose --env-file .env logs -f
```

### Port conflicts

Modify ports in `.env` file to use different ports

### Volume permissions

On Linux, ensure proper permissions:
```bash
sudo chown -R $USER:$USER ./data
```

## Development Mode

For development with hot-reload, see:
- [Analytics UI Development](../analytics-ui/README.md)
- [AI Service Development](../analytics-ai-service/README.md)

## Production Deployment

For production deployments, see:
- [Kubernetes Deployment](../deployment/kustomizations/README.md)
- [Docker Compose Production Guide](../DEPLOYMENT.md)
