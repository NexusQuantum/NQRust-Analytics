# NQRust-Analytics

**Open-Source Analytics Platform with AI-Powered Natural Language Querying**

NQRust-Analytics is a comprehensive analytics platform that enables users to query databases using natural language, generate accurate SQL queries, create visualizations, and gain AI-powered insights.

---

## ✨ Features

### Core Capabilities
- **Natural Language to SQL**: Convert plain English questions into accurate SQL queries
- **Multi-Database Support**: Connect to various data sources seamlessly
- **AI-Powered Insights**: Get intelligent analysis and recommendations
- **Interactive Visualizations**: Auto-generate charts and dashboards
- **Semantic Layer**: MDL (Modeling Definition Language) for consistent data definitions
- **Real-time Analytics**: Process and analyze data in real-time

### Key Benefits
- **No SQL Knowledge Required**: Business users can query data without technical expertise
- **Accurate Results**: Semantic layer ensures consistent and governed data access
- **Flexible LLM Integration**: Support for multiple AI model providers
- **Self-Hosted**: Full control over your data and infrastructure

---

## 🔌 Supported Data Sources

- **Cloud Data Warehouses**: Snowflake, BigQuery, Redshift, Azure Synapse
- **Relational Databases**: PostgreSQL, MySQL, SQL Server, Oracle
- **Analytics Engines**: DuckDB, Trino, ClickHouse, Athena
- **And more**: Extensible architecture for custom connectors

---

## 🤖 Supported LLM Models

- OpenAI (GPT-4, GPT-3.5)
- Azure OpenAI
- Google Gemini (AI Studio & Vertex AI)
- Anthropic Claude (API & Bedrock)
- DeepSeek
- Groq
- Ollama (Local models)
- Databricks

See [configuration examples](./analytics-ai-service/docs/config_examples) for setup details.

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose
- OpenAI API key (or other LLM provider)
- Minimum 4GB RAM

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/NexusQuantum/NQRust-Analytics.git
   cd NQRust-Analytics
   ```

2. **Configure environment**
   ```bash
   cd docker
   cp .env.example .env
   # Edit .env and add your API keys
   ```

3. **Start services**
   ```bash
   docker-compose up -d
   ```

4. **Access the application**
   - UI: http://localhost:3000
   - API: http://localhost:5556

### Development Setup

See individual service README files for detailed development instructions:
- [Analytics AI Service](./analytics-ai-service/README.md)
- [Analytics UI](./analytics-ui/README.md)
- [Analytics Launcher](./analytics-launcher/README.md)

---

## 📁 Project Structure

```
NQRust-Analytics/
├── analytics-ai-service/   # AI/LLM service (Python/FastAPI)
├── analytics-ui/           # Web interface (Next.js/React)
├── analytics-launcher/     # CLI launcher (Go)
├── analytics-engine/       # Query engine (submodule)
├── deployment/             # Kubernetes & deployment configs
├── docker/                 # Docker compose files
└── docs/                   # Documentation
```

---

## 🏗️ Architecture

### Components

1. **Analytics UI** (Next.js)
   - User interface for data exploration
   - Dashboard creation and management
   - Connection management

2. **Analytics AI Service** (Python/FastAPI)
   - Natural language processing
   - SQL generation via LLM
   - RAG (Retrieval-Augmented Generation) pipelines

3. **Analytics Engine** (Rust/Java)
   - Query execution and optimization
   - MDL (Semantic layer) processing
   - Multi-database connectivity

4. **Supporting Services**
   - Qdrant: Vector database for embeddings
   - PostgreSQL: Metadata storage

### Data Flow

```
User Query (Natural Language)
    ↓
Analytics UI
    ↓
Analytics AI Service (LLM Processing)
    ↓
Analytics Engine (SQL Execution)
    ↓
Data Source
    ↓
Results + Visualizations
```

---

## 🛠️ Configuration

### LLM Configuration

Edit `docker/config.yaml` to configure your LLM provider:

```yaml
llm_provider:
  type: openai  # or azure_openai, gemini, anthropic, etc.
  api_key: ${OPENAI_API_KEY}
  model: gpt-4
```

### Database Connection

Configure data sources through the UI or via API. Supported authentication methods:
- Username/Password
- API Keys
- Service Account (for cloud providers)
- SSH Tunneling

---

## 📚 Documentation

- [Installation Guide](./DEPLOYMENT.md)
- [Configuration Examples](./analytics-ai-service/docs/config_examples/)
- [Contributing Guidelines](./CONTRIBUTING.md)
- [Code of Conduct](./CODE_OF_CONDUCT.md)
- [Security Policy](./SECURITY.md)

---

## 🤝 Contributing

We welcome contributions! Here's how to get started:

1. ⭐ Star the repository
2. 🐛 Report bugs via [GitHub Issues](https://github.com/NexusQuantum/NQRust-Analytics/issues)
3. 💡 Suggest features in [Discussions](https://github.com/NexusQuantum/NQRust-Analytics/discussions)
4. 📖 Read [Contributing Guidelines](./CONTRIBUTING.md)
5. 🔧 Submit pull requests

---

## 📄 License

This project is licensed under the AGPL-3.0 License - see the [LICENSE](./LICENSE) file for details.

---

## 🙏 Acknowledgments

Built with:
- Next.js & React
- FastAPI & Python
- Rust & Java
- PostgreSQL & Qdrant
- Docker & Kubernetes

---

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/NexusQuantum/NQRust-Analytics/issues)
- **Discussions**: [GitHub Discussions](https://github.com/NexusQuantum/NQRust-Analytics/discussions)

---

**Made with ❤️ by NexusQuantum**
