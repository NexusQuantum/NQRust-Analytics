# LLM Configuration Examples

## Overview

This directory contains configuration examples for various LLM (Large Language Model) providers supported by NQRust-Analytics. Each file demonstrates how to configure the AI service to work with different providers.

## ⚠️ Important Notice

**DO NOT simply copy and paste these configurations!**

These are **example templates** that require customization:

1. **Read the comments** in each file carefully
2. **Understand each section** and parameter
3. **Replace placeholder values** with your actual credentials
4. **Adjust model names** to match your subscription
5. **Modify pipeline settings** based on your needs

For detailed configuration documentation, see [Configuration Guide](../configuration.md).

## Available Providers

### Cloud Providers

- **[OpenAI](./config.openai.yaml)** - GPT-4, GPT-3.5-turbo
- **[Azure OpenAI](./config.azure.yaml)** - Azure-hosted OpenAI models
- **[Google AI Studio](./config.google_ai_studio.yaml)** - Gemini models (free tier)
- **[Google Vertex AI](./config.google_vertexai.yaml)** - Gemini models (enterprise)
- **[Anthropic](./config.anthropic.yaml)** - Claude models
- **[AWS Bedrock](./config.bedrock.yaml)** - Multi-model platform
- **[DeepSeek](./config.deepseek.yaml)** - DeepSeek models
- **[Groq](./config.grok.yaml)** - Fast inference platform

### Local/Self-Hosted

- **[Ollama](./config.ollama.yaml)** - Run models locally
- **[LM Studio](./config.lm_studio.yaml)** - Local model server

### Specialized

- **[Qwen3](./config.qwen3.yaml)** - Qwen models with thinking/no-thinking modes
- **[Zhipu](./config.zhipu.yaml)** - GLM models
- **[Open Router](./config.open_router.yaml)** - Multi-provider gateway

## Configuration Steps

### 1. Choose Your Provider

Select the configuration file that matches your LLM provider.

### 2. Copy to Main Config

```bash
# From analytics-ai-service directory
cp docs/config_examples/config.{provider}.yaml config.yaml
```

### 3. Set API Keys

Add your API keys to `.env.dev`:

```env
# OpenAI
OPENAI_API_KEY=sk-...

# Azure OpenAI
AZURE_OPENAI_API_KEY=...
AZURE_OPENAI_ENDPOINT=https://...

# Google
GOOGLE_API_KEY=...

# Anthropic
ANTHROPIC_API_KEY=...

# And so on...
```

### 4. Customize Configuration

Edit `config.yaml` to:
- Update model names
- Adjust temperature and other parameters
- Configure embedding models
- Set up document stores
- Customize pipeline behavior

### 5. Verify Configuration

```bash
# Start the service
just start

# Check logs for errors
# Service should start without configuration errors
```

## Common Configuration Sections

### LLM Provider

```yaml
type: llm
providers:
  - provider: litellm_llm
    models:
      - model: gpt-4
        kwargs:
          api_key: ${OPENAI_API_KEY}
          temperature: 0.0
```

### Embedder

```yaml
type: embedder
providers:
  - provider: litellm_embedder
    models:
      - model: text-embedding-3-small
        kwargs:
          api_key: ${OPENAI_API_KEY}
          dimensions: 1536
```

### Document Store

```yaml
type: document_store
providers:
  - provider: qdrant
    kwargs:
      url: http://qdrant:6333
      embedding_dim: 1536
```

### Pipelines

```yaml
type: pipeline
pipes:
  - name: ask
    llm: litellm_llm.gpt-4
    embedder: litellm_embedder.text-embedding-3-small
```

## Provider-Specific Notes

### Qwen3 (Thinking Mode)

Qwen3 supports special thinking modes:

**Thinking Mode** (`/think`):
- Step-by-step reasoning
- Best for complex problems
- Optimized: `temperature=0.6`, `top_p=0.95`

**Fast Mode** (`/no_think`):
- Direct responses
- Best for simple queries
- Optimized: `temperature=0.7`, `top_p=0.8`

Available models:
- `qwen/qwen3-30b-a3b` - 30B MoE (3.3B activated)
- `qwen/qwen3-32b` - 32B dense
- `qwen/qwen3-8b` - 8B dense
- `qwen/qwen3-14b` - 14B dense

Usage:
```
"Explain quantum computing /think"
"What is 2+2? /no_think"
```

Requires `OPENROUTER_API_KEY` in `.env.dev`.

### Azure OpenAI

Requires additional configuration:
- Deployment names (not model names)
- API version
- Azure endpoint URL

### Google Vertex AI

Requires:
- Service account credentials
- Project ID and location
- Proper IAM permissions

### Ollama (Local)

Requires:
- Ollama installed and running
- Models pulled locally
- Correct endpoint configuration

## Troubleshooting

### API Key Errors

- Verify keys are set in `.env.dev`
- Check key format (some require prefixes)
- Ensure keys have proper permissions

### Model Not Found

- Check model name spelling
- Verify model availability in your region
- Confirm subscription/access level

### Connection Errors

- Verify endpoint URLs
- Check network connectivity
- Ensure services are running (for local providers)

### Performance Issues

- Adjust temperature and sampling parameters
- Try different models
- Check rate limits

## Contributing

To add a new provider configuration:

1. Create `config.{provider}.yaml`
2. Add detailed comments explaining each section
3. Include example values
4. Document required environment variables
5. Add provider to this README
6. Test the configuration
7. Submit pull request

See [CONTRIBUTING.md](../../../CONTRIBUTING.md) for guidelines.

## Support

For configuration help:
- [GitHub Issues](https://github.com/NexusQuantum/NQRust-Analytics/issues)
- [GitHub Discussions](https://github.com/NexusQuantum/NQRust-Analytics/discussions)
- [Configuration Guide](../configuration.md)
