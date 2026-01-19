# Multi-Database Federation Plan

> **Status**: Proposed Enhancement
> **Author**: Architecture Team
> **Created**: January 2026
> **Target**: Future Release

## Executive Summary

This document outlines the architectural plan to enable Tableau-style multi-database querying in NQRust Analytics. Currently, each project supports a single database connection. This enhancement will allow users to:

1. Connect multiple databases to a single project
2. Query across databases seamlessly
3. Create relationships between tables in different databases
4. Let the AI generate cross-database SQL automatically

---

## Table of Contents

1. [Current Architecture](#current-architecture)
2. [Target Architecture](#target-architecture)
3. [Phase 1: Data Model Changes](#phase-1-data-model-changes)
4. [Phase 2: Schema Indexing for Multi-DB](#phase-2-schema-indexing-for-multi-db)
5. [Phase 3: AI Retrieval Enhancements](#phase-3-ai-retrieval-enhancements)
6. [Phase 4: SQL Generation Changes](#phase-4-sql-generation-changes)
7. [Phase 5: Query Execution Federation](#phase-5-query-execution-federation)
8. [Phase 6: UI/UX Updates](#phase-6-uiux-updates)
9. [Phase 7: Testing & Optimization](#phase-7-testing--optimization)
10. [Risk Assessment](#risk-assessment)
11. [Success Metrics](#success-metrics)

---

## Current Architecture

### How It Works Today

```
┌─────────────────────────────────────────────────────────────┐
│                         PROJECT                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  type: "postgres"                                    │    │
│  │  connectionInfo: { host, port, database, ... }       │    │
│  │  MDL: { models, relationships, metrics }             │    │
│  └─────────────────────────────────────────────────────┘    │
│                            │                                 │
│                            ▼                                 │
│                   ┌─────────────────┐                       │
│                   │  Single Database │                       │
│                   │   (PostgreSQL)   │                       │
│                   └─────────────────┘                       │
└─────────────────────────────────────────────────────────────┘
```

### Current Limitations

| Limitation | Impact |
|------------|--------|
| One database per project | Cannot analyze data across systems |
| Single connection info | No way to store multiple credentials |
| MDL assumes single source | Models don't specify which DB they belong to |
| AI retrieval is source-agnostic | No concept of "which database has this table" |
| Query execution is single-target | Ibis adapter routes to one database |

### Relevant Current Files

| Component | File | Purpose |
|-----------|------|---------|
| Project Model | `analytics-ui/src/apollo/server/dataSource.ts` | Defines single `connectionInfo` per project |
| MDL Schema | `analytics-mdl/mdl.schema.json` | Schema definition without source awareness |
| Schema Indexing | `analytics-ai-service/src/pipelines/indexing/db_schema.py` | Chunks DDL without source metadata |
| SQL Generation | `analytics-ai-service/src/pipelines/generation/sql_generation.py` | Single-source retrieval and generation |
| Query Execution | `analytics-ui/src/apollo/server/adaptors/ibisAdaptor.ts` | Routes to single database |

---

## Target Architecture

### Multi-Database Vision

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              PROJECT                                     │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │  dataSources: [                                                    │  │
│  │    { name: "warehouse", type: "postgres", connectionInfo: {...} }, │  │
│  │    { name: "crm", type: "snowflake", connectionInfo: {...} },      │  │
│  │    { name: "analytics", type: "bigquery", connectionInfo: {...} }  │  │
│  │  ]                                                                 │  │
│  │                                                                    │  │
│  │  MDL: {                                                            │  │
│  │    models: [                                                       │  │
│  │      { name: "orders", dataSource: "warehouse", ... },             │  │
│  │      { name: "customers", dataSource: "crm", ... }                 │  │
│  │    ],                                                              │  │
│  │    relationships: [                                                │  │
│  │      { models: ["orders", "customers"], crossDatabase: true, ... } │  │
│  │    ]                                                               │  │
│  │  }                                                                 │  │
│  └───────────────────────────────────────────────────────────────────┘  │
│                                    │                                     │
│           ┌────────────────────────┼────────────────────────┐           │
│           ▼                        ▼                        ▼           │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │    warehouse    │    │       crm       │    │    analytics    │     │
│  │   (PostgreSQL)  │    │   (Snowflake)   │    │   (BigQuery)    │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│           │                        │                        │           │
│           └────────────────────────┼────────────────────────┘           │
│                                    ▼                                     │
│                        ┌─────────────────────┐                          │
│                        │  Federation Layer   │                          │
│                        │      (DuckDB)       │                          │
│                        └─────────────────────┘                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Data Model Changes

### 1.1 New Database Migration

Create `data_source` table to support multiple connections per project:

```sql
-- Migration: 20260120_add_multi_database_support.js

CREATE TABLE data_source (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,

  -- Identification
  name VARCHAR(100) NOT NULL,           -- Internal name: "warehouse", "crm"
  display_name VARCHAR(255),            -- UI display: "Production Warehouse"

  -- Connection
  type VARCHAR(50) NOT NULL,            -- "postgres", "snowflake", "bigquery"
  connection_info JSONB NOT NULL,       -- Encrypted connection details

  -- Metadata
  description TEXT,                     -- What this source contains
  schema_filter VARCHAR(255),           -- Optional: limit to specific schemas
  is_primary BOOLEAN DEFAULT false,     -- Primary source for the project

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_sync_at TIMESTAMP,
  last_sync_status VARCHAR(50),

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(project_id, name)
);

CREATE INDEX idx_data_source_project ON data_source(project_id);
```

### 1.2 Virtual Relationships Table

Store cross-database relationships that can't exist as actual foreign keys:

```sql
CREATE TABLE virtual_relationship (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES project(id) ON DELETE CASCADE,

  -- Source side
  source_data_source_id INTEGER NOT NULL REFERENCES data_source(id),
  source_table VARCHAR(255) NOT NULL,
  source_column VARCHAR(255) NOT NULL,

  -- Target side
  target_data_source_id INTEGER NOT NULL REFERENCES data_source(id),
  target_column VARCHAR(255) NOT NULL,
  target_table VARCHAR(255) NOT NULL,

  -- Relationship metadata
  join_type VARCHAR(50) NOT NULL,       -- "ONE_TO_ONE", "ONE_TO_MANY", "MANY_TO_ONE"
  confidence DECIMAL(3,2) DEFAULT 1.0,  -- How reliable is this mapping?
  notes TEXT,                           -- Additional context for AI

  -- Audit
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by INTEGER REFERENCES user(id),

  UNIQUE(source_data_source_id, source_table, source_column,
         target_data_source_id, target_table, target_column)
);
```

### 1.3 MDL Schema Updates

Update `analytics-mdl/mdl.schema.json`:

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "properties": {
    "dataSources": {
      "type": "array",
      "description": "Available data sources for this project",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "type": { "type": "string", "enum": ["postgres", "mysql", "snowflake", "bigquery", "redshift", "duckdb"] },
          "description": { "type": "string" },
          "properties": {
            "type": "object",
            "properties": {
              "updateFrequency": { "type": "string" },
              "dataCategory": { "type": "string", "enum": ["transactional", "analytical", "operational", "reference"] }
            }
          }
        },
        "required": ["name", "type"]
      }
    },
    "models": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "name": { "type": "string" },
          "dataSource": {
            "type": "string",
            "description": "Which data source this model belongs to"
          },
          "tableReference": {
            "type": "string",
            "description": "Full table reference: schema.table"
          },
          "columns": { "type": "array" },
          "primaryKey": { "type": "string" }
        },
        "required": ["name", "dataSource", "tableReference"]
      }
    },
    "relationships": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "models": { "type": "array", "items": { "type": "string" } },
          "condition": { "type": "string" },
          "joinType": { "type": "string" },
          "crossDatabase": {
            "type": "boolean",
            "description": "True if this relationship spans multiple data sources"
          }
        }
      }
    }
  }
}
```

### 1.4 TypeScript Type Updates

Update `analytics-ui/src/apollo/server/dataSource.ts`:

```typescript
// New: Data Source entity
export interface DataSource {
  id: number;
  projectId: number;
  name: string;                    // "warehouse", "crm"
  displayName: string;             // "Production Warehouse"
  type: DataSourceName;            // "postgres", "snowflake"
  connectionInfo: ANALYTICS_AI_CONNECTION_INFO;
  description?: string;
  schemaFilter?: string;
  isPrimary: boolean;
  isActive: boolean;
  lastSyncAt?: Date;
  lastSyncStatus?: 'success' | 'failed' | 'pending';
  createdAt: Date;
  updatedAt: Date;
}

// New: Virtual Relationship entity
export interface VirtualRelationship {
  id: number;
  projectId: number;
  sourceDataSourceId: number;
  sourceTable: string;
  sourceColumn: string;
  targetDataSourceId: number;
  targetTable: string;
  targetColumn: string;
  joinType: 'ONE_TO_ONE' | 'ONE_TO_MANY' | 'MANY_TO_ONE' | 'MANY_TO_MANY';
  confidence: number;
  notes?: string;
}

// Updated: Project now references multiple data sources
export interface Project {
  id: number;
  displayName: string;
  // DEPRECATED: type and connectionInfo - use dataSources instead
  type?: DataSourceName;
  connectionInfo?: ANALYTICS_AI_CONNECTION_INFO;
  // NEW
  dataSources?: DataSource[];
  // ... rest of fields
}
```

### 1.5 New Repository Layer

Create `analytics-ui/src/apollo/server/repositories/dataSourceRepository.ts`:

```typescript
export interface IDataSourceRepository {
  // CRUD
  create(dataSource: Omit<DataSource, 'id' | 'createdAt' | 'updatedAt'>): Promise<DataSource>;
  getById(id: number): Promise<DataSource | null>;
  getByProjectId(projectId: number): Promise<DataSource[]>;
  getByName(projectId: number, name: string): Promise<DataSource | null>;
  update(id: number, updates: Partial<DataSource>): Promise<DataSource>;
  delete(id: number): Promise<void>;

  // Connection testing
  testConnection(dataSource: DataSource): Promise<{ success: boolean; error?: string }>;

  // Schema discovery
  discoverTables(dataSource: DataSource): Promise<TableMetadata[]>;
  discoverColumns(dataSource: DataSource, table: string): Promise<ColumnMetadata[]>;
}
```

---

## Phase 2: Schema Indexing for Multi-DB

### 2.1 Enhanced DDL Chunking

Update `analytics-ai-service/src/pipelines/indexing/db_schema.py`:

```python
class MultiDBDDLChunker:
    """
    Chunks DDL with rich data source context for multi-database retrieval.
    """

    def chunk(self, mdl: dict, project_id: str) -> List[Document]:
        documents = []

        # Index data source metadata first
        for source in mdl.get('dataSources', []):
            documents.append(self._create_source_document(source, project_id))

        # Index models with source context
        for model in mdl.get('models', []):
            source_name = model.get('dataSource')
            source_info = self._get_source_info(mdl, source_name)

            documents.extend(
                self._create_model_documents(model, source_info, project_id)
            )

        # Index cross-database relationships separately
        for rel in mdl.get('relationships', []):
            if rel.get('crossDatabase'):
                documents.append(
                    self._create_cross_db_relationship_document(rel, mdl, project_id)
                )

        return documents

    def _create_source_document(self, source: dict, project_id: str) -> Document:
        """Create a document describing the data source itself."""
        content = f"""
[DATA SOURCE: {source['name']}]
Type: {source['type']}
Description: {source.get('description', 'No description')}
Data Category: {source.get('properties', {}).get('dataCategory', 'unknown')}
Update Frequency: {source.get('properties', {}).get('updateFrequency', 'unknown')}

Tables in this source:
{self._list_tables_for_source(source['name'])}
"""
        return Document(
            id=str(uuid.uuid4()),
            meta={
                'type': 'DATA_SOURCE',
                'name': source['name'],
                'source_type': source['type'],
                'project_id': project_id
            },
            content=content
        )

    def _create_model_documents(
        self,
        model: dict,
        source_info: dict,
        project_id: str
    ) -> List[Document]:
        """Create documents for a model with full source context."""

        # Fully qualified name
        fqn = f"{source_info['name']}.{model.get('tableReference', model['name'])}"

        # Rich DDL with source context
        ddl_content = f"""
[DATA SOURCE: {source_info['name']}]
[SOURCE TYPE: {source_info['type']}]
[DATA CATEGORY: {source_info.get('properties', {}).get('dataCategory', 'unknown')}]

CREATE TABLE {fqn} (
{self._format_columns(model['columns'])}
)

[DESCRIPTION: {model.get('properties', {}).get('description', 'No description')}]
[PRIMARY KEY: {model.get('primaryKey', 'None')}]
[ROW COUNT: {model.get('properties', {}).get('rowCount', 'Unknown')}]
"""

        return [Document(
            id=str(uuid.uuid4()),
            meta={
                'type': 'TABLE_SCHEMA',
                'name': model['name'],
                'fully_qualified_name': fqn,
                'data_source': source_info['name'],
                'data_source_type': source_info['type'],
                'data_category': source_info.get('properties', {}).get('dataCategory'),
                'project_id': project_id
            },
            content=ddl_content
        )]

    def _create_cross_db_relationship_document(
        self,
        relationship: dict,
        mdl: dict,
        project_id: str
    ) -> Document:
        """Create a document specifically for cross-database relationships."""

        models = relationship['models']
        model_sources = [
            self._get_model_source(mdl, m) for m in models
        ]

        content = f"""
[CROSS-DATABASE RELATIONSHIP]

Source Table: {model_sources[0]['source']}.{models[0]}
Target Table: {model_sources[1]['source']}.{models[1]}

Join Condition: {relationship['condition']}
Join Type: {relationship['joinType']}

Notes: This relationship spans multiple databases.
When joining these tables, use the CTE pattern to query each source separately,
then join the results in the federation layer.

Source Database: {model_sources[0]['source']} ({model_sources[0]['type']})
Target Database: {model_sources[1]['source']} ({model_sources[1]['type']})
"""

        return Document(
            id=str(uuid.uuid4()),
            meta={
                'type': 'CROSS_DB_RELATIONSHIP',
                'models': models,
                'sources': [ms['source'] for ms in model_sources],
                'project_id': project_id
            },
            content=content
        )
```

### 2.2 Source Description Indexing

Create `analytics-ai-service/src/pipelines/indexing/source_description.py`:

```python
class SourceDescriptionIndexer:
    """
    Indexes rich descriptions of data sources for AI context.
    """

    async def index(
        self,
        data_source: DataSourceConfig,
        tables: List[TableMetadata],
        project_id: str
    ):
        # Create comprehensive source description
        description = self._build_source_description(data_source, tables)

        # Embed and store
        embedding = await self.embedder.run(description)

        await self.document_store.write_documents([
            Document(
                id=str(uuid.uuid4()),
                embedding=embedding,
                meta={
                    'type': 'SOURCE_DESCRIPTION',
                    'name': data_source.name,
                    'source_type': data_source.type,
                    'project_id': project_id
                },
                content=description
            )
        ])

    def _build_source_description(
        self,
        source: DataSourceConfig,
        tables: List[TableMetadata]
    ) -> str:
        # Group tables by apparent domain
        domains = self._infer_domains(tables)

        return f"""
# Data Source: {source.display_name or source.name}

## Overview
- **Type**: {source.type}
- **Category**: {source.data_category or 'General'}
- **Update Frequency**: {source.update_frequency or 'Unknown'}

## Description
{source.description or 'No description provided.'}

## What This Source Is Best For
{self._infer_best_uses(source, tables)}

## Data Domains
{self._format_domains(domains)}

## Key Tables
{self._format_key_tables(tables[:10])}

## Table Count
{len(tables)} tables available
"""
```

### 2.3 SQL Functions Per Source

Update `analytics-ai-service/src/pipelines/indexing/sql_functions.py`:

```python
class SQLFunctionIndexer:
    """
    Indexes available SQL functions PER data source type.
    """

    DIALECT_FUNCTIONS = {
        'postgres': {
            'date_truncate': "DATE_TRUNC('unit', column)",
            'date_extract': "EXTRACT(unit FROM column)",
            'string_concat': "CONCAT(str1, str2) or str1 || str2",
            'null_coalesce': "COALESCE(value, default)",
            'json_extract': "column->>'key' or column->'key'",
            # ... more functions
        },
        'snowflake': {
            'date_truncate': "DATE_TRUNC('UNIT', column)",
            'date_extract': "EXTRACT(unit FROM column)",
            'string_concat': "CONCAT(str1, str2)",
            'null_coalesce': "COALESCE(value, default) or NVL(value, default)",
            'json_extract': "column:key or GET_PATH(column, 'key')",
            # ... more functions
        },
        'bigquery': {
            'date_truncate': "DATE_TRUNC(column, UNIT)",
            'date_extract': "EXTRACT(UNIT FROM column)",
            'string_concat': "CONCAT(str1, str2)",
            'null_coalesce': "COALESCE(value, default) or IFNULL(value, default)",
            'json_extract': "JSON_EXTRACT(column, '$.key')",
            # ... more functions
        }
    }

    async def index_for_source(self, source_name: str, source_type: str, project_id: str):
        functions = self.DIALECT_FUNCTIONS.get(source_type, {})

        content = f"""
# SQL Functions for {source_name} ({source_type})

When writing SQL for tables in the '{source_name}' data source, use these functions:

## Date/Time Functions
- Truncate date: {functions.get('date_truncate', 'N/A')}
- Extract part: {functions.get('date_extract', 'N/A')}

## String Functions
- Concatenate: {functions.get('string_concat', 'N/A')}

## Null Handling
- Coalesce: {functions.get('null_coalesce', 'N/A')}

## JSON Functions
- Extract: {functions.get('json_extract', 'N/A')}
"""

        await self.document_store.write_documents([
            Document(
                id=str(uuid.uuid4()),
                meta={
                    'type': 'SQL_FUNCTIONS',
                    'data_source': source_name,
                    'data_source_type': source_type,
                    'project_id': project_id
                },
                content=content
            )
        ])
```

---

## Phase 3: AI Retrieval Enhancements

### 3.1 Source Classification Pipeline

Create `analytics-ai-service/src/pipelines/generation/source_classifier.py`:

```python
class SourceClassifier:
    """
    Determines which data sources are relevant for a given question.
    This runs BEFORE table retrieval to narrow the search space.
    """

    SYSTEM_PROMPT = """
You are analyzing a user's analytics question to determine which data sources to query.

## Available Data Sources
{% for source in sources %}
### {{ source.name }} ({{ source.type }})
{{ source.description }}

**Data Category**: {{ source.data_category }}
**Best For**: {{ source.best_for }}
**Key Tables**: {{ source.key_tables | join(', ') }}

{% endfor %}

## Your Task
Given the user's question, determine:
1. Which data source(s) are needed to answer it
2. Confidence score for each source (0.0 to 1.0)
3. Whether multiple sources need to be joined

## Rules
- If the question mentions a specific source name, that source is definitely needed
- If the question is about transactional/real-time data, prefer OLTP sources
- If the question is about historical trends or aggregations, prefer analytical sources
- If concepts span multiple sources (e.g., "orders" + "marketing segments"), multiple sources needed
- If genuinely ambiguous between sources, mark as "needs_clarification"

## Response Format
```json
{
  "sources": [
    {"name": "source_name", "confidence": 0.9, "reason": "..."}
  ],
  "needs_clarification": false,
  "clarification_question": null,
  "is_cross_database": false
}
```
"""

    async def classify(
        self,
        question: str,
        available_sources: List[SourceMetadata],
        project_id: str
    ) -> SourceClassificationResult:

        # First, try semantic search on source descriptions
        source_scores = await self._semantic_source_search(question, project_id)

        # Then, use LLM for nuanced classification
        prompt = self._build_prompt(question, available_sources, source_scores)

        response = await self.llm.generate(
            system=self.SYSTEM_PROMPT,
            user=prompt
        )

        return SourceClassificationResult.parse(response)

    async def _semantic_source_search(
        self,
        question: str,
        project_id: str
    ) -> Dict[str, float]:
        """Quick semantic search to pre-score sources."""

        embedding = await self.embedder.run(question)

        results = await self.document_store.query(
            query_embedding=embedding,
            filters={
                'type': 'SOURCE_DESCRIPTION',
                'project_id': project_id
            },
            top_k=10
        )

        return {
            doc.meta['name']: doc.score
            for doc in results
        }
```

### 3.2 Hierarchical Table Retrieval

Update `analytics-ai-service/src/pipelines/retrieval/db_schema.py`:

```python
class MultiDBSchemaRetrieval:
    """
    Hierarchical retrieval: Sources → Tables → Columns
    """

    async def retrieve(
        self,
        question: str,
        project_id: str,
        classified_sources: List[str] = None
    ) -> RetrievalResult:

        # STAGE 1: If sources not pre-classified, classify them
        if classified_sources is None:
            classification = await self.source_classifier.classify(
                question,
                await self._get_available_sources(project_id),
                project_id
            )

            if classification.needs_clarification:
                return RetrievalResult(
                    needs_clarification=True,
                    clarification=classification.clarification_question
                )

            classified_sources = [s.name for s in classification.sources if s.confidence > 0.5]

        # STAGE 2: Retrieve tables from classified sources only
        tables = []
        for source_name in classified_sources:
            source_tables = await self._retrieve_tables_from_source(
                question=question,
                project_id=project_id,
                source_name=source_name,
                limit=5  # Top 5 per source
            )
            tables.extend(source_tables)

        # STAGE 3: Get cross-database relationships if multiple sources
        cross_db_relationships = []
        if len(classified_sources) > 1:
            cross_db_relationships = await self._retrieve_cross_db_relationships(
                project_id=project_id,
                sources=classified_sources,
                tables=[t.name for t in tables]
            )

        # STAGE 4: Re-rank considering relationships
        ranked_tables = await self._rerank_with_relationships(
            question=question,
            tables=tables,
            relationships=cross_db_relationships
        )

        return RetrievalResult(
            tables=ranked_tables[:10],
            cross_db_relationships=cross_db_relationships,
            sources_used=classified_sources
        )

    async def _retrieve_tables_from_source(
        self,
        question: str,
        project_id: str,
        source_name: str,
        limit: int
    ) -> List[TableDocument]:
        """Retrieve tables from a specific source."""

        embedding = await self.embedder.run(question)

        results = await self.document_store.query(
            query_embedding=embedding,
            filters={
                'type': 'TABLE_SCHEMA',
                'data_source': source_name,
                'project_id': project_id
            },
            top_k=limit
        )

        return [TableDocument.from_doc(doc) for doc in results]

    async def _retrieve_cross_db_relationships(
        self,
        project_id: str,
        sources: List[str],
        tables: List[str]
    ) -> List[CrossDBRelationship]:
        """Get relationships that connect tables across sources."""

        results = await self.document_store.query(
            query_embedding=[],  # Filter-only query
            filters={
                'type': 'CROSS_DB_RELATIONSHIP',
                'project_id': project_id,
                'sources': {'$overlap': sources}
            }
        )

        # Filter to relationships involving our tables
        relevant = [
            CrossDBRelationship.from_doc(doc)
            for doc in results
            if any(m in tables for m in doc.meta['models'])
        ]

        return relevant
```

### 3.3 Disambiguation Pipeline

Create `analytics-ai-service/src/pipelines/generation/disambiguator.py`:

```python
class TableDisambiguator:
    """
    Handles cases where the same concept exists in multiple sources.
    e.g., "customers" table in both warehouse and CRM.
    """

    SYSTEM_PROMPT = """
You are helping disambiguate which table the user is referring to.

The user asked: "{{ question }}"

Multiple tables match this concept:

{% for table in candidate_tables %}
## {{ table.fully_qualified_name }}
- **Source**: {{ table.data_source }} ({{ table.data_source_type }})
- **Description**: {{ table.description }}
- **Key Columns**: {{ table.key_columns | join(', ') }}
- **Row Count**: {{ table.row_count }}
- **Data Category**: {{ table.data_category }}

{% endfor %}

## Decision Rules
1. If the question mentions real-time or recent data → prefer transactional sources
2. If the question is about trends/history → prefer analytical sources
3. If the question mentions specific columns only in one table → use that table
4. If context from prior conversation indicates a source → use that
5. If genuinely ambiguous → ask the user

## Response Format
```json
{
  "decision": "resolved" | "needs_clarification",
  "selected_table": "fully_qualified_name or null",
  "reason": "explanation",
  "clarification_question": "question for user if needed",
  "clarification_options": ["option1", "option2"]
}
```
"""

    async def disambiguate(
        self,
        question: str,
        candidate_tables: List[TableDocument],
        conversation_history: List[Message] = None
    ) -> DisambiguationResult:

        # Check if only one candidate
        if len(candidate_tables) == 1:
            return DisambiguationResult(
                decision='resolved',
                selected_table=candidate_tables[0].fully_qualified_name
            )

        # Check if question explicitly mentions source
        for table in candidate_tables:
            if table.data_source.lower() in question.lower():
                return DisambiguationResult(
                    decision='resolved',
                    selected_table=table.fully_qualified_name,
                    reason=f"Question mentions '{table.data_source}'"
                )

        # Use LLM to disambiguate
        response = await self.llm.generate(
            system=self.SYSTEM_PROMPT,
            user=self._build_prompt(question, candidate_tables, conversation_history)
        )

        return DisambiguationResult.parse(response)
```

### 3.4 Context Window Management

Create `analytics-ai-service/src/pipelines/generation/context_manager.py`:

```python
class MultiDBContextManager:
    """
    Manages context window for multi-database queries.
    Aggressively prunes to fit within token limits.
    """

    MAX_TOKENS = 8000
    TOKENS_PER_TABLE_FULL = 500      # Average full DDL
    TOKENS_PER_TABLE_SUMMARY = 100   # Compressed summary
    TOKENS_PER_RELATIONSHIP = 50

    async def build_context(
        self,
        question: str,
        tables: List[TableDocument],
        relationships: List[CrossDBRelationship],
        sources: List[SourceMetadata]
    ) -> GenerationContext:

        # Calculate budget
        base_tokens = 2000  # System prompt, examples, etc.
        available_tokens = self.MAX_TOKENS - base_tokens

        # Allocate tokens
        source_tokens = min(len(sources) * 200, 600)
        relationship_tokens = min(len(relationships) * self.TOKENS_PER_RELATIONSHIP, 500)
        table_tokens = available_tokens - source_tokens - relationship_tokens

        # LEVEL 1: Prune sources (keep most relevant)
        pruned_sources = await self._prune_sources(question, sources, source_tokens)

        # LEVEL 2: Categorize tables by relevance
        high_relevance, medium_relevance, low_relevance = await self._categorize_tables(
            question, tables
        )

        # LEVEL 3: Build table context with mixed detail levels
        table_context = await self._build_table_context(
            high_relevance=high_relevance,      # Full DDL
            medium_relevance=medium_relevance,  # Key columns only
            low_relevance=low_relevance,        # Summary only
            budget=table_tokens
        )

        # LEVEL 4: Column pruning for large tables
        if self._count_tokens(table_context) > table_tokens:
            table_context = await self._prune_columns(question, table_context)

        return GenerationContext(
            source_descriptions=self._format_sources(pruned_sources),
            table_schemas=table_context,
            relationships=self._format_relationships(relationships),
            dialect_hints=self._build_dialect_hints(pruned_sources)
        )

    async def _categorize_tables(
        self,
        question: str,
        tables: List[TableDocument]
    ) -> Tuple[List, List, List]:
        """Categorize tables by relevance to the question."""

        # Use a small, fast model for quick categorization
        response = await self.fast_llm.generate(
            system="Categorize each table by relevance to the question: HIGH, MEDIUM, or LOW",
            user=f"""
Question: {question}

Tables:
{json.dumps([{'name': t.fully_qualified_name, 'description': t.description} for t in tables])}

Return JSON: {{"high": [...names], "medium": [...names], "low": [...names]}}
"""
        )

        categories = json.loads(response)

        return (
            [t for t in tables if t.fully_qualified_name in categories['high']],
            [t for t in tables if t.fully_qualified_name in categories['medium']],
            [t for t in tables if t.fully_qualified_name in categories['low']]
        )

    async def _build_table_context(
        self,
        high_relevance: List[TableDocument],
        medium_relevance: List[TableDocument],
        low_relevance: List[TableDocument],
        budget: int
    ) -> str:
        """Build table context with varying detail levels."""

        context_parts = []
        used_tokens = 0

        # High relevance: Full DDL with all columns
        for table in high_relevance:
            if used_tokens + self.TOKENS_PER_TABLE_FULL > budget:
                break
            context_parts.append(self._format_full_ddl(table))
            used_tokens += self.TOKENS_PER_TABLE_FULL

        # Medium relevance: Key columns only
        for table in medium_relevance:
            if used_tokens + self.TOKENS_PER_TABLE_SUMMARY > budget:
                break
            context_parts.append(self._format_key_columns(table))
            used_tokens += self.TOKENS_PER_TABLE_SUMMARY

        # Low relevance: Just mention they exist
        if low_relevance and used_tokens < budget - 100:
            context_parts.append(
                f"\n[Also available but likely not needed: {', '.join(t.name for t in low_relevance)}]"
            )

        return '\n\n'.join(context_parts)
```

---

## Phase 4: SQL Generation Changes

### 4.1 Multi-DB System Prompt

Update `analytics-ai-service/src/pipelines/generation/utils/sql.py`:

```python
MULTI_DB_SYSTEM_PROMPT = """
You are an expert SQL analyst working with MULTIPLE databases simultaneously.

## CRITICAL: Multi-Database Query Rules

### 1. Table Naming
ALWAYS use fully qualified table names: {data_source}.{schema}.{table}
- Example: warehouse.public.orders, crm.sales.customers

### 2. Cross-Database Joins
When joining tables from DIFFERENT data sources, you MUST use the CTE pattern:

```sql
-- SOURCE: warehouse (postgres)
WITH warehouse_data AS (
  SELECT column1, column2, join_key
  FROM warehouse.public.orders
  WHERE <filters>  -- Apply filters HERE to reduce data
),

-- SOURCE: crm (snowflake)
crm_data AS (
  SELECT column1, column2, join_key
  FROM crm.sales.customers
  WHERE <filters>  -- Apply filters HERE to reduce data
)

-- FINAL: Join in federation layer
SELECT
  w.column1,
  c.column2
FROM warehouse_data w
JOIN crm_data c ON w.join_key = c.join_key
```

### 3. Dialect-Specific Syntax
Each CTE MUST use the correct SQL dialect for its source:

{% for source in sources %}
#### {{ source.name }} ({{ source.type }})
{% for func_name, func_syntax in source.functions.items() %}
- {{ func_name }}: {{ func_syntax }}
{% endfor %}
{% endfor %}

### 4. Performance Optimization
- ALWAYS apply WHERE filters inside CTEs, not on the final join
- SELECT only the columns you need in each CTE
- Prefer filtering on indexed columns (usually primary keys and foreign keys)

### 5. Type Compatibility
When joining across databases, be aware of type differences:
- Cast explicitly if needed: CAST(column AS VARCHAR)
- Handle NULL differently per database if needed

## Available Data Sources

{% for source in sources %}
### {{ source.name }} ({{ source.type }})
{{ source.description }}

Tables:
{% for table in source.tables %}
- {{ table.name }}: {{ table.description }}
{% endfor %}

{% endfor %}

## Cross-Database Relationships

{% for rel in cross_db_relationships %}
- {{ rel.source_table }} → {{ rel.target_table }}
  Condition: {{ rel.condition }}
  Type: {{ rel.join_type }}
{% endfor %}
"""
```

### 4.2 Updated SQL Generation Pipeline

Update `analytics-ai-service/src/pipelines/generation/sql_generation.py`:

```python
class MultiDBSQLGeneration:
    """
    SQL generation pipeline for multi-database queries.
    """

    async def generate(
        self,
        question: str,
        context: GenerationContext,
        project_id: str
    ) -> SQLGenerationResult:

        # Determine if this is a cross-database query
        sources_needed = context.get_sources_used()
        is_cross_db = len(sources_needed) > 1

        # Build appropriate prompt
        if is_cross_db:
            system_prompt = self._build_cross_db_prompt(context)
            sql_template = "CTE_PATTERN"
        else:
            system_prompt = self._build_single_db_prompt(context)
            sql_template = "STANDARD"

        # Generate SQL
        user_prompt = self._build_user_prompt(
            question=question,
            context=context,
            sql_template=sql_template
        )

        response = await self.llm.generate(
            system=system_prompt,
            user=user_prompt
        )

        sql = self._extract_sql(response)

        # Post-process
        sql = await self._post_process(sql, context, is_cross_db)

        return SQLGenerationResult(
            sql=sql,
            sources_used=sources_needed,
            is_cross_database=is_cross_db,
            reasoning=self._extract_reasoning(response)
        )

    async def _post_process(
        self,
        sql: str,
        context: GenerationContext,
        is_cross_db: bool
    ) -> str:
        """Post-process generated SQL."""

        # 1. Ensure fully qualified names
        sql = self._ensure_qualified_names(sql, context)

        # 2. Add source comments for cross-DB CTEs
        if is_cross_db:
            sql = self._add_source_comments(sql, context)

        # 3. Quote identifiers appropriately per dialect
        sql = self._quote_identifiers(sql, context)

        return sql
```

### 4.3 SQL Pair Retrieval with Source Matching

Update `analytics-ai-service/src/pipelines/retrieval/sql_pairs.py`:

```python
class MultiDBSQLPairRetrieval:
    """
    Retrieves SQL examples, preferring those that match the sources being used.
    """

    async def retrieve(
        self,
        question: str,
        sources_used: List[str],
        project_id: str,
        limit: int = 3
    ) -> List[SQLPair]:

        embedding = await self.embedder.run(question)

        # First: Try to find examples using the SAME sources
        same_source_pairs = await self._retrieve_with_source_filter(
            embedding=embedding,
            sources=sources_used,
            project_id=project_id,
            limit=limit,
            require_exact_match=True
        )

        if len(same_source_pairs) >= limit:
            return same_source_pairs

        # Second: Find cross-DB examples if this is cross-DB
        if len(sources_used) > 1:
            cross_db_pairs = await self._retrieve_cross_db_examples(
                embedding=embedding,
                project_id=project_id,
                limit=limit - len(same_source_pairs)
            )
            same_source_pairs.extend(cross_db_pairs)

        # Third: Fall back to any relevant examples
        if len(same_source_pairs) < limit:
            general_pairs = await self._retrieve_general(
                embedding=embedding,
                project_id=project_id,
                limit=limit - len(same_source_pairs),
                exclude_ids=[p.id for p in same_source_pairs]
            )
            same_source_pairs.extend(general_pairs)

        return same_source_pairs[:limit]

    async def _retrieve_cross_db_examples(
        self,
        embedding: List[float],
        project_id: str,
        limit: int
    ) -> List[SQLPair]:
        """Specifically retrieve cross-database query examples."""

        results = await self.document_store.query(
            query_embedding=embedding,
            filters={
                'type': 'SQL_PAIR',
                'project_id': project_id,
                'is_cross_db': True
            },
            top_k=limit
        )

        return [SQLPair.from_doc(doc) for doc in results]
```

---

## Phase 5: Query Execution Federation

### 5.1 Federation Engine (DuckDB-based)

Create `analytics-ui/src/apollo/server/adaptors/federatedQueryExecutor.ts`:

```typescript
import * as duckdb from 'duckdb';

interface FederatedQueryOptions {
  sql: string;
  sources: Map<string, DataSource>;
  projectId: number;
}

interface QueryPlan {
  sourceQueries: Map<string, string>;  // source name → subquery
  finalJoinQuery: string;
  executionOrder: string[];
}

export class FederatedQueryExecutor {
  private duckdb: duckdb.Database;
  private ibisAdaptor: IbisAdaptor;

  constructor(ibisAdaptor: IbisAdaptor) {
    this.ibisAdaptor = ibisAdaptor;
    this.duckdb = new duckdb.Database(':memory:');
  }

  async execute(options: FederatedQueryOptions): Promise<QueryResult> {
    const { sql, sources } = options;

    // 1. Parse SQL to identify source-specific CTEs
    const plan = this.parseQueryPlan(sql);

    // 2. Execute each source query in parallel
    const sourceResults = await this.executeSourceQueries(plan, sources);

    // 3. Load results into DuckDB
    await this.loadResultsIntoDuckDB(sourceResults);

    // 4. Execute the final join query in DuckDB
    const result = await this.executeFinalQuery(plan.finalJoinQuery);

    // 5. Cleanup
    await this.cleanup(sourceResults);

    return result;
  }

  private parseQueryPlan(sql: string): QueryPlan {
    // Parse CTEs and identify which source each belongs to
    // Look for comments like "-- SOURCE: warehouse (postgres)"

    const ctePattern = /--\s*SOURCE:\s*(\w+)\s*\((\w+)\)\s*\n\s*(\w+)\s+AS\s*\(([\s\S]*?)\)/gi;
    const sourceQueries = new Map<string, string>();

    let match;
    while ((match = ctePattern.exec(sql)) !== null) {
      const [_, sourceName, sourceType, cteName, cteQuery] = match;
      sourceQueries.set(sourceName, `SELECT * FROM (${cteQuery}) AS ${cteName}`);
    }

    // Extract final query (after all CTEs)
    const finalQueryMatch = sql.match(/\)\s*\n\s*SELECT[\s\S]*$/i);
    const finalJoinQuery = finalQueryMatch ? finalQueryMatch[0].substring(1).trim() : '';

    return {
      sourceQueries,
      finalJoinQuery,
      executionOrder: Array.from(sourceQueries.keys())
    };
  }

  private async executeSourceQueries(
    plan: QueryPlan,
    sources: Map<string, DataSource>
  ): Promise<Map<string, any[]>> {
    const results = new Map<string, any[]>();

    // Execute in parallel
    const promises = Array.from(plan.sourceQueries.entries()).map(
      async ([sourceName, query]) => {
        const source = sources.get(sourceName);
        if (!source) {
          throw new Error(`Unknown data source: ${sourceName}`);
        }

        const result = await this.ibisAdaptor.query(query, {
          dataSource: source.type,
          connectionInfo: source.connectionInfo
        });

        return { sourceName, data: result.data };
      }
    );

    const completed = await Promise.all(promises);
    completed.forEach(({ sourceName, data }) => {
      results.set(sourceName, data);
    });

    return results;
  }

  private async loadResultsIntoDuckDB(
    sourceResults: Map<string, any[]>
  ): Promise<void> {
    const conn = this.duckdb.connect();

    for (const [sourceName, data] of sourceResults.entries()) {
      // Create table from JSON data
      const tableName = `${sourceName}_data`;

      // DuckDB can directly query JSON
      conn.run(`
        CREATE TABLE ${tableName} AS
        SELECT * FROM read_json_auto(?)
      `, [JSON.stringify(data)]);
    }

    conn.close();
  }

  private async executeFinalQuery(query: string): Promise<QueryResult> {
    return new Promise((resolve, reject) => {
      const conn = this.duckdb.connect();

      conn.all(query, (err, result) => {
        conn.close();

        if (err) {
          reject(err);
        } else {
          resolve({
            columns: Object.keys(result[0] || {}),
            data: result
          });
        }
      });
    });
  }

  private async cleanup(sourceResults: Map<string, any[]>): Promise<void> {
    const conn = this.duckdb.connect();

    for (const sourceName of sourceResults.keys()) {
      conn.run(`DROP TABLE IF EXISTS ${sourceName}_data`);
    }

    conn.close();
  }
}
```

### 5.2 Federated Validator

Create `analytics-ai-service/src/pipelines/generation/federated_validator.py`:

```python
class FederatedValidator:
    """
    Validates federated SQL queries by checking each source subquery.
    """

    async def validate(
        self,
        sql: str,
        sources: Dict[str, DataSourceConfig],
        project_id: str
    ) -> ValidationResult:

        errors = []
        warnings = []

        # 1. Parse the federated query
        try:
            plan = self.parse_query_plan(sql)
        except ParseError as e:
            return ValidationResult(
                valid=False,
                errors=[f"Failed to parse query: {e}"]
            )

        # 2. Validate each source subquery
        for source_name, subquery in plan.source_queries.items():
            source = sources.get(source_name)

            if not source:
                errors.append(f"Unknown data source: {source_name}")
                continue

            # Dry-run against the actual source
            result = await self.ibis_client.dry_run(
                sql=subquery,
                data_source=source.type,
                connection_info=source.connection_info
            )

            if not result.valid:
                errors.append({
                    'source': source_name,
                    'query': subquery,
                    'error': result.error
                })

        # 3. Validate join compatibility
        join_errors = await self._validate_joins(plan, sources)
        errors.extend(join_errors)

        # 4. Check for type mismatches
        type_warnings = await self._check_type_compatibility(plan, sources)
        warnings.extend(type_warnings)

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
            query_plan=plan
        )

    async def _validate_joins(
        self,
        plan: QueryPlan,
        sources: Dict[str, DataSourceConfig]
    ) -> List[str]:
        """Validate that joins between sources make sense."""

        errors = []

        for join in plan.joins:
            left_source = self._get_source_for_table(join.left_table, plan)
            right_source = self._get_source_for_table(join.right_table, plan)

            # Check if columns exist
            left_columns = await self._get_table_columns(
                join.left_table, sources[left_source]
            )
            right_columns = await self._get_table_columns(
                join.right_table, sources[right_source]
            )

            if join.left_column not in left_columns:
                errors.append(
                    f"Column {join.left_column} not found in {join.left_table}"
                )

            if join.right_column not in right_columns:
                errors.append(
                    f"Column {join.right_column} not found in {join.right_table}"
                )

        return errors
```

### 5.3 Updated Ibis Adaptor

Update `analytics-ui/src/apollo/server/adaptors/ibisAdaptor.ts`:

```typescript
export class IbisAdaptor {
  // ... existing code ...

  /**
   * Execute a federated query across multiple data sources.
   */
  async executeFederatedQuery(
    sql: string,
    sources: DataSource[],
    options: FederatedQueryOptions = {}
  ): Promise<IbisQueryResponse> {

    // Check if this is actually a cross-database query
    const sourcesUsed = this.detectSourcesInQuery(sql, sources);

    if (sourcesUsed.length <= 1) {
      // Single source - use standard execution
      return this.query(sql, {
        dataSource: sourcesUsed[0].type,
        connectionInfo: sourcesUsed[0].connectionInfo,
        mdl: options.mdl
      });
    }

    // Multi-source - use federation
    const executor = new FederatedQueryExecutor(this);

    const sourcesMap = new Map(
      sources.map(s => [s.name, s])
    );

    return executor.execute({
      sql,
      sources: sourcesMap,
      projectId: options.projectId
    });
  }

  private detectSourcesInQuery(
    sql: string,
    availableSources: DataSource[]
  ): DataSource[] {
    const used = new Set<string>();

    for (const source of availableSources) {
      // Check if source name appears in the query
      const pattern = new RegExp(`\\b${source.name}\\.`, 'gi');
      if (pattern.test(sql)) {
        used.add(source.name);
      }
    }

    return availableSources.filter(s => used.has(s.name));
  }
}
```

---

## Phase 6: UI/UX Updates

### 6.1 Multi-Source Connection Setup

New page: `analytics-ui/src/pages/setup/data-sources.tsx`

**Features:**
- List all connected data sources
- Add new data source with connection wizard
- Test connection before saving
- Set primary data source
- Edit/delete existing sources

**UI Components:**
```
┌─────────────────────────────────────────────────────────────┐
│  Data Sources                                    [+ Add New] │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ⭐ warehouse (PostgreSQL)                    [Primary] │   │
│  │    Production transactional database                   │   │
│  │    Last synced: 2 hours ago  ✓ Connected              │   │
│  │    Tables: 45  │  [Edit] [Test] [Remove]              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ crm (Snowflake)                                       │   │
│  │    Customer and marketing data warehouse              │   │
│  │    Last synced: 1 day ago  ✓ Connected                │   │
│  │    Tables: 23  │  [Edit] [Test] [Remove]              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ analytics (BigQuery)                                  │   │
│  │    Aggregated analytics and reporting                 │   │
│  │    Last synced: 3 hours ago  ⚠ Connection issue       │   │
│  │    Tables: 12  │  [Edit] [Test] [Remove]              │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.2 Model Editor with Source Selection

Update `analytics-ui/src/pages/modeling.tsx`

**Add source dropdown to model editor:**
```
┌─────────────────────────────────────────────────────────────┐
│  Edit Model: orders                                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Data Source:  [warehouse (PostgreSQL)     ▼]               │
│                                                              │
│  Table:        [public.orders              ▼]               │
│                                                              │
│  Display Name: [Orders                      ]               │
│                                                              │
│  Description:  [Customer order transactions ]               │
│                                                              │
│  ─────────────────────────────────────────────────────────  │
│  Columns                                                     │
│  ─────────────────────────────────────────────────────────  │
│  │ Name          │ Type    │ Source Column │ Description │  │
│  │ order_id      │ INTEGER │ id            │ Primary key │  │
│  │ customer_id   │ INTEGER │ customer_id   │ FK to...    │  │
│  │ ...           │ ...     │ ...           │ ...         │  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.3 Cross-Database Relationship Editor

Update `analytics-ui/src/pages/setup/relationships.tsx`

**Visual indicator for cross-database relationships:**
```
┌─────────────────────────────────────────────────────────────┐
│  Relationships                                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ orders → order_items                    [Same DB]     │   │
│  │ warehouse.orders.id = warehouse.order_items.order_id  │   │
│  │ Type: ONE_TO_MANY                                     │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ orders → customers                      [Cross-DB] ⚡ │   │
│  │ warehouse.orders.customer_id = crm.customers.id       │   │
│  │ Type: MANY_TO_ONE                                     │   │
│  │ ⚠ Cross-database join - may impact performance        │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [+ Add Relationship]                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.4 Query Results with Source Attribution

Update `analytics-ui/src/components/pages/home/promptThread/ChartAnswer.tsx`

**Show which sources were queried:**
```
┌─────────────────────────────────────────────────────────────┐
│  Q: Show revenue by customer segment                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Sources: warehouse (PostgreSQL), crm (Snowflake)           │
│  Query type: Cross-database federation                       │
│  Execution time: 1.2s                                        │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │                                                       │   │
│  │            [Bar Chart: Revenue by Segment]           │   │
│  │                                                       │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  [View SQL] [View Query Plan] [Export]                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 6.5 Disambiguation Dialog

New component: `analytics-ui/src/components/modals/DisambiguationModal.tsx`

**When AI needs clarification on which table to use:**
```
┌─────────────────────────────────────────────────────────────┐
│  Which "customers" table should I use?                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Your question mentions "customers" but this exists in       │
│  multiple data sources:                                      │
│                                                              │
│  ○ warehouse.public.customers                                │
│    Transactional customer data with order history            │
│    50,000 rows • Updated in real-time                        │
│                                                              │
│  ○ crm.sales.customers                                       │
│    Marketing data with segments and campaigns                │
│    48,500 rows • Updated daily                               │
│                                                              │
│  ○ Use both (join them together)                             │
│    Combine transactional and marketing data                  │
│                                                              │
│                              [Cancel]  [Continue]            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 7: Testing & Optimization

### 7.1 Test Scenarios

| Scenario | Description | Expected Behavior |
|----------|-------------|-------------------|
| Single source query | Query using tables from one DB | Standard execution, no federation |
| Cross-DB query (2 sources) | Join tables from 2 different DBs | CTE pattern, parallel execution |
| Cross-DB query (3+ sources) | Complex query across many DBs | Optimized execution order |
| Ambiguous table reference | "customers" exists in multiple DBs | Disambiguation prompt |
| Source unavailable | One source is down during query | Graceful error with partial results option |
| Large cross-DB join | Joining millions of rows across DBs | Filter pushdown, chunked execution |
| Dialect-specific functions | Using DATE_TRUNC across Postgres + Snowflake | Correct dialect in each CTE |

### 7.2 Performance Benchmarks

| Metric | Target | Measurement Method |
|--------|--------|-------------------|
| Source classification | < 500ms | Time from question to source determination |
| Schema retrieval | < 1s | Time to retrieve relevant tables |
| SQL generation | < 3s | Time to generate valid SQL |
| Cross-DB query (small) | < 5s | < 10K rows per source |
| Cross-DB query (medium) | < 30s | < 100K rows per source |
| Cross-DB query (large) | < 2min | < 1M rows per source |

### 7.3 Optimization Strategies

1. **Connection Pooling**: Maintain warm connections to frequently used sources
2. **Query Caching**: Cache identical cross-DB query results (with TTL)
3. **Predicate Pushdown**: Push WHERE clauses into source CTEs
4. **Parallel Execution**: Execute source CTEs concurrently
5. **Result Streaming**: Stream large results instead of loading all into memory
6. **Smart Chunking**: For large joins, process in chunks

### 7.4 Monitoring & Observability

Add metrics for:
- Queries per source
- Cross-DB vs single-DB query ratio
- Average rows transferred per source
- Query failures by source
- Source latency percentiles

---

## Risk Assessment

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Cross-DB queries too slow | Medium | High | Filter pushdown, caching, query hints |
| AI generates invalid cross-DB SQL | Medium | Medium | Enhanced validation, error correction loop |
| Context window overflow | Medium | Medium | Aggressive pruning, source pre-classification |
| User confusion about sources | Low | Medium | Clear UI indicators, helpful error messages |
| Connection pool exhaustion | Low | High | Pool limits, connection timeouts, monitoring |
| Data type mismatches in joins | Medium | Medium | Type checking in validator, explicit casts |

---

## Success Metrics

### Adoption Metrics
- % of projects using multiple data sources
- Average number of sources per project
- Cross-DB query volume vs single-DB

### Quality Metrics
- SQL generation accuracy for cross-DB queries (target: >85%)
- User disambiguation rate (lower is better)
- Query retry rate due to errors

### Performance Metrics
- P50/P95 query latency for cross-DB queries
- Source classification accuracy
- Context utilization efficiency

---

## Appendix A: Migration Path for Existing Projects

Existing single-source projects will continue to work unchanged. Migration to multi-source:

1. **Automatic**: Existing `project.type` and `project.connectionInfo` become the "primary" data source
2. **Optional**: Users can add additional sources via new UI
3. **Backward Compatible**: Old API endpoints continue to work; new endpoints added for multi-source

```typescript
// Backward compatibility layer
function getProjectDataSource(project: Project): DataSource {
  if (project.dataSources?.length > 0) {
    return project.dataSources.find(ds => ds.isPrimary) || project.dataSources[0];
  }

  // Legacy: create virtual DataSource from old fields
  return {
    id: -1,
    projectId: project.id,
    name: 'default',
    displayName: 'Default',
    type: project.type,
    connectionInfo: project.connectionInfo,
    isPrimary: true,
    isActive: true
  };
}
```

---

## Appendix B: Supported Database Combinations

| Primary | Secondary | Federation Support |
|---------|-----------|-------------------|
| PostgreSQL | Snowflake | ✅ Full |
| PostgreSQL | BigQuery | ✅ Full |
| PostgreSQL | MySQL | ✅ Full |
| PostgreSQL | Redshift | ✅ Full |
| Snowflake | BigQuery | ✅ Full |
| Snowflake | PostgreSQL | ✅ Full |
| BigQuery | Snowflake | ✅ Full |
| DuckDB | Any | ✅ Full (DuckDB as federation layer) |
| Any | Any | ⚠️ Via DuckDB federation |

---

## Appendix C: Example Cross-Database Query

**User Question**: "Show me total revenue by customer segment, comparing this year to last year"

**Sources Involved**:
- `warehouse` (PostgreSQL): orders table
- `crm` (Snowflake): customers table with segments

**Generated SQL**:
```sql
-- SOURCE: warehouse (postgres)
WITH warehouse_revenue AS (
  SELECT
    customer_id,
    DATE_TRUNC('year', order_date) as order_year,
    SUM(amount) as total_revenue
  FROM warehouse.public.orders
  WHERE order_date >= '2025-01-01'
  GROUP BY customer_id, DATE_TRUNC('year', order_date)
),

-- SOURCE: crm (snowflake)
crm_segments AS (
  SELECT
    id as customer_id,
    segment
  FROM crm.sales.customers
  WHERE is_active = true
)

-- FEDERATION LAYER
SELECT
  c.segment,
  w.order_year,
  SUM(w.total_revenue) as revenue
FROM warehouse_revenue w
JOIN crm_segments c ON w.customer_id = c.customer_id
GROUP BY c.segment, w.order_year
ORDER BY c.segment, w.order_year
```

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | January 2026 | Architecture Team | Initial draft |

---

## Next Steps

1. **Review**: Share with engineering team for feedback
2. **Prioritize**: Determine which phases to tackle first
3. **Prototype**: Build proof-of-concept for federation layer
4. **Iterate**: Refine based on prototype learnings
