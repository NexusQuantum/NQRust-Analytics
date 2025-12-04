# Evaluation Framework

## Overview

The Evaluation Framework provides comprehensive tools for assessing the performance of the Analytics AI Service. It enables systematic testing, benchmarking, and quality assurance of natural language to SQL conversion capabilities.

## Key Features

- **Dataset Support**: Spider 1.0, Bird, and custom datasets
- **Multiple Metrics**: Accuracy, relevancy, faithfulness, and more
- **LLM-based Evaluation**: Semantic SQL comparison
- **Langfuse Integration**: Trace visualization and analysis
- **Pipeline Testing**: Test individual components or full workflows

## Prerequisites

- **Just**: Command runner ([Installation guide](https://github.com/casey/just#packages))
- **Langfuse Account**: For trace visualization ([Sign up](https://cloud.langfuse.com))
- **Python 3.12**: Via Poetry (handled by parent project)
- **Running Services**: Analytics Engine, Ibis Server, Qdrant

## Quick Start

### 1. Install Just

Follow the [Just installation guide](https://github.com/casey/just#packages) for your platform.

### 2. Configure Langfuse

1. Create account at [Langfuse Cloud](https://cloud.langfuse.com)
2. Get API key and secret
3. Add to `.env.dev` in `analytics-ai-service/`:

```env
LANGFUSE_PUBLIC_KEY=your_public_key
LANGFUSE_SECRET_KEY=your_secret_key
LANGFUSE_HOST=https://cloud.langfuse.com
```

### 3. Start Development Services

```bash
# From analytics-ai-service directory
just up
```

### 4. Copy Configuration

Ensure `config.yaml` exists in `analytics-ai-service/eval/` directory.

## Dataset Preparation

### Using Spider or Bird Datasets

Download and prepare evaluation datasets:

```bash
# Spider 1.0 (default)
just prep

# Or specify dataset explicitly
just prep spider1.0

# Bird dataset
just prep bird
```

This will:
1. Download dataset to `analytics-ai-service/tools/dev/etc/{dataset}/`
2. Generate evaluation files in `analytics-ai-service/eval/dataset/`

Output files:
- Spider: `spider_{db_name}_eval_dataset.toml`
- Bird: `bird_{db_name}_eval_dataset.toml`

### Custom Dataset Curation

For creating custom evaluation datasets:

```bash
# From analytics-ai-service directory
just curate_eval_data
```

This starts an interactive app for dataset curation.

## Datasource Configuration

### For Spider/Bird Datasets

Configure the local database path in `config.yaml`:

```yaml
eval_data_db_path: "etc/bird/minidev/MINIDEV/dev_databases"
```

### For BigQuery Datasets

#### Option 1: config.yaml

```yaml
bigquery_project_id: "your_project_id"
bigquery_dataset_id: "your_dataset_id"
bigquery_credentials: "base64_encoded_credentials"
```

#### Option 2: .env.dev (Recommended for secrets)

```env
BIGQUERY_PROJECT_ID="your_project_id"
BIGQUERY_DATASET_ID="your_dataset_id"
BIGQUERY_CREDENTIALS="base64_encoded_credentials"
```

#### Encoding Credentials

```bash
cat path/to/credentials.json | base64
```

## Running Evaluations

### 1. Generate Predictions

Run the AI service against evaluation dataset:

```bash
just predict {evaluation-dataset}
```

Example:

```bash
just predict spider_concert_singer_eval_dataset
```

#### Sub-Pipeline Predictions

Test specific pipeline components:

```bash
# Test retrieval pipeline only
just predict {dataset} retrieval

# Test generation pipeline only
just predict {dataset} generation

# Test full ask pipeline (default)
just predict {dataset} ask
```

Supported pipelines:
- `ask` - Full question-to-answer pipeline (default)
- `generation` - SQL generation only
- `retrieval` - Context retrieval only

Results are saved to `outputs/predictions/` with Langfuse traces.

### 2. Evaluate Results

Compare predictions against ground truth:

```bash
just eval {prediction-result}
```

Example:

```bash
just eval outputs/predictions/20241204_spider_concert_singer.json
```

#### Semantic Comparison

Enable LLM-based semantic SQL comparison for improved accuracy:

```bash
# Add OpenAI API key to .env in analytics-ai-service/eval/
OPENAI_API_KEY=your_key

# Run with semantics flag
just eval {prediction-result} --semantics
```

Results appear in Langfuse with detailed metrics.

## Evaluation Metrics

### Core Metrics

- **Accuracy**: Proportion of correct SQL outputs vs expected
- **Answer Relevancy**: How well LLM generates relevant information
- **Faithfulness**: Factual correctness aligned with retrieval context
- **Contextual Relevancy**: Retriever's ability to minimize irrelevant information
- **Contextual Recall**: Embedding model's retrieval effectiveness
- **Contextual Precision**: Reranker's ability to prioritize relevant results

### Custom Metrics

- **QuestionToReasoningJudge**: Reasoning alignment with question
- **ReasoningToSqlJudge**: SQL alignment with reasoning
- **SqlSemanticsJudge**: Semantic equivalence to expected SQL

## Dataset Schema

Each evaluation dataset contains:

- `dataset_id` (UUID): Unique identifier
- `date`: Creation timestamp
- `mdl`: Model definition language schema
- `eval_dataset`: Questions, expected SQL, and context

## Langfuse Visualization

Evaluation results are visualized in Langfuse with:

- **Traces**: Full execution flow
- **Metrics**: Quantitative performance data
- **Comparisons**: Side-by-side SQL comparison
- **Context**: Retrieved information used

Example trace structure:

```
Session: {dataset_name}_{timestamp}
├── Trace: Question 1
│   ├── Retrieval
│   ├── Generation
│   └── Evaluation
├── Trace: Question 2
│   └── ...
```

## Output Structure

```
analytics-ai-service/eval/
├── dataset/              # Evaluation datasets (.toml)
├── outputs/
│   ├── predictions/     # Prediction results (.json)
│   └── evaluations/     # Evaluation reports
├── config.yaml          # Service configuration
└── .env                 # Environment variables
```

## Troubleshooting

### Services Not Running

Ensure all dependencies are started:

```bash
just up
docker ps  # Verify containers are running
```

### Dataset Download Fails

Check internet connection and try manual download from:
- Spider: https://yale-lily.github.io/spider
- Bird: https://bird-bench.github.io/

### Langfuse Connection Issues

Verify credentials in `.env.dev`:

```bash
curl -H "Authorization: Bearer $LANGFUSE_PUBLIC_KEY" \
  https://cloud.langfuse.com/api/public/health
```

### Prediction Errors

- Check `config.yaml` LLM configuration
- Verify API keys in `.env.dev`
- Review logs in `outputs/predictions/`

## Advanced Usage

### Custom Evaluation Metrics

Add custom metrics by extending the evaluation framework in `eval/` directory.

### Batch Evaluation

Run multiple datasets:

```bash
for dataset in dataset/*.toml; do
  just predict $(basename $dataset .toml)
done
```

### Performance Profiling

Enable detailed logging:

```yaml
# In config.yaml
logging:
  level: DEBUG
  trace_enabled: true
```

## Contributing

To add new evaluation metrics or datasets:

1. Follow the dataset schema
2. Add metric implementation
3. Update documentation
4. Submit pull request

See [CONTRIBUTING.md](../CONTRIBUTING.md) for guidelines.

## References

- [Langfuse Documentation](https://langfuse.com/docs)
- [Spider Dataset](https://yale-lily.github.io/spider)
- [Bird Benchmark](https://bird-bench.github.io/)
