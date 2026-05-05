# Notebook RAG (NotebookLM-style document Q&A)

Quick guide for the NotebookLM-style document RAG feature added to NQRust-Analytics.

## What it does

- Upload PDF / DOCX / MD / TXT / PPTX / XLSX / HTML to a "notebook"
- Documents are parsed, chunked, embedded (OpenAI `text-embedding-3-large`), and stored in Qdrant
- Per-user checkbox to mark documents as active context (NotebookLM-style)
- Ask questions in plain language — answers cite documents inline as `[filename, hal. PAGE]`

## Quick start

### 1. Start infra (Qdrant, Postgres demo, Engine, Ibis)
```powershell
cd d:\Project\NQRust-Analytics
docker compose -f docker-compose.dev-infra.yaml up -d
```

### 2. Set OpenAI API key
Edit `analytics-ai-service/.env.dev`:
```
OPENAI_API_KEY=sk-proj-...your-real-key...
```

### 3. Start AI service (port 5555)
```powershell
cd analytics-ai-service
$key = (Get-Content .env.dev | Where-Object { $_ -match 'OPENAI_API_KEY=(.*)' } | ForEach-Object { $matches[1] })
$env:OPENAI_API_KEY = $key
$env:PYTHONIOENCODING = "utf-8"
.\.venv\Scripts\python.exe -m uvicorn src.__main__:app --host 127.0.0.1 --port 5555 --loop asyncio --http httptools
```

### 4. Start UI dev server (port 13000)
```powershell
cd analytics-ui
$env:TZ = "UTC"
yarn next dev -p 13000
```

### 5. Open browser
Go to http://localhost:13000

If first time, set cookie `nqrust_license_status=valid` for `localhost` (DevTools → Application → Cookies → Add).

Login with `admin@localhost` (password from migration seed).

### 6. Use the feature
- Visit http://localhost:13000/notebook
- Click "+ New notebook" or open existing
- In the notebook page (`/notebook/<id>`):
  - Left panel: upload PDFs via the "+" button, wait for ✅ ready
  - Check the boxes of documents to use as context
  - Type your question in the input below the chat area
  - Click "Ask" → answer appears with `[filename, hal. PAGE]` citations

## Endpoints

### REST (AI service, port 5555)
- `POST /v1/documents/index` — body: `{document_id, notebook_id, project_id, filename, file_path}`
- `GET /v1/documents/{id}/status` — poll indexing status
- `DELETE /v1/documents/{id}` — remove chunks from Qdrant
- `POST /v1/documents/ask` — body: `{query, selected_document_ids, project_id?}` → returns `{answer, chunks_used}`

### Next.js (UI, port 13000)
- `POST /api/v1/documents/upload` — multipart, fields: `file`, `notebookId`
- `GET /api/v1/documents/{id}/status` — server-side polling proxy
- `POST /api/v1/documents/ask` — proxy to AI service, requires NextAuth session
- `POST /api/graphql` — `notebooks`, `documents`, `createNotebook`, `toggleDocumentSelection`, etc.

## Architecture

```
   ┌──────────────────┐  multipart upload    ┌────────────────────┐
   │ /notebook/[id]   │ ─────────────────▶  │ /api/v1/documents/ │
   │ (React)          │                     │  upload (Next.js)  │
   └──────────────────┘                     └────────────────────┘
            │ GraphQL                                 │
            │ (notebooks/docs)                        │ POST /v1/documents/index
            ▼                                         ▼
   ┌──────────────────┐                     ┌────────────────────┐
   │ Apollo Server    │                     │ analytics-ai-svc   │
   │ + DocumentsServ  │                     │ FastAPI :5555      │
   │ + NotebookServ   │                     │  parse → chunk →   │
   └──────────────────┘                     │  embed (OpenAI) →  │
            │                                │  Qdrant 'documents'│
            ▼                                └────────────────────┘
   ┌──────────────────┐
   │ SQLite           │
   │  notebooks,      │
   │  documents,      │
   │  doc_selections  │
   └──────────────────┘

   For ask:
   /notebook/[id] ─┐
                   ▼
   /api/v1/documents/ask  →  POST /v1/documents/ask
                              ↓
                    DocumentsRetrieval (vector search Qdrant)
                              ↓
                    DocumentAnswer prompt + LLM (gpt-4.1-nano default)
                              ↓
                    {answer with [filename, hal. PAGE] citations}
```

## File map

### AI service
- `src/core/document/{parser,chunker,hash}.py` — adapted from OpenKB
- `src/pipelines/indexing/documents.py` — Hamilton DAG: parse → chunk → embed → write
- `src/pipelines/retrieval/documents.py` — vector search filtered by `document_id IN selected`
- `src/pipelines/generation/document_answer.py` — doc-only Q&A pipeline
- `src/pipelines/generation/sql_generation.py` — modified: accepts `document_context`
- `src/web/v1/services/documents.py` — orchestrator service
- `src/web/v1/routers/documents.py` — REST endpoints
- `src/web/v1/services/ask.py` — modified: `selected_document_ids` field on `AskRequest`

### UI
- `migrations/2026050400000{0,1,2}_*.js` — `notebook`, `document`, `document_selection`
- `src/apollo/server/repositories/{notebook,document,documentSelection}Repository.ts`
- `src/apollo/server/services/{notebook,document}Service.ts`
- `src/apollo/server/resolvers/notebookResolver.ts`
- `src/apollo/server/utils/documentStorage.ts` — local FS adapter
- `src/components/sources/{SourcesPanel,SourceItem,UploadDialog,NotebookPicker}.tsx`
- `src/hooks/useNotebookContext.tsx`
- `src/pages/api/v1/documents/{upload,[id]/status,ask}.ts`
- `src/pages/notebook/{index,[id]}.tsx` — list + detail with chat box

## Limits

- 30 MB per file
- 500 pages per document max (pdf only)
- 30 documents per notebook max
- 10 documents selectable as context at once
- Top-K = 8 chunks retrieved per question

## Known limitations / future work

1. **Chat-existing integration (Phase 12)** — Sources panel shows in `/home/[id]` but the existing thread chat doesn't yet route through `selectedDocumentIds`. Use `/notebook/[id]` for guaranteed doc-only Q&A.
2. **Hybrid (DB + docs) Q&A** — works only if a project schema is deployed. Without deployment, falls back to doc-only via `/v1/documents/ask`.
3. **DEV_BYPASS_LICENSE** — dev shortcut in `analytics-ui/.env.local`. Remove for production.
4. **Project ID hardcoded** to 1 for MVP in `/notebook/index.tsx` and `[id].tsx`. Production needs to read from active project context.
