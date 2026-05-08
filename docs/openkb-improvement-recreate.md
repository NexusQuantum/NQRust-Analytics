# Document RAG — Recreate Guide

Panduan untuk menambahkan fitur **Document RAG** ke NQRust-Analytics: user upload dokumen, pilih sebagai context, lalu tanya pertanyaan natural language yang dijawab LLM dengan citations berbasis isi dokumen.

Dokumen ini menjelaskan arsitektur dan file-file yang perlu disentuh — bukan resep step-by-step copy-paste.

---

## Apa yang Ditambahkan

1. **Upload dokumen** (PDF, DOCX, PPTX, XLSX, MD, TXT, HTML) via UI
2. **Indexing pipeline** — parse → chunk → embed → simpan ke Qdrant
3. **Sources panel** di sidebar — list dokumen project + checkbox untuk pilih context aktif
4. **Document Q&A flow** — kalau ada dokumen tercentang saat user tanya, jawaban di-generate dari isi dokumen (bukan SQL)
5. **Citations** — jawaban menyertakan referensi ke chunk dokumen sumber
6. **Sidebar layout baru** — tiga section dengan independent scroll: My Dashboards, History, Sources Panel
7. **Header bar fixes** — icon BookOpen di Knowledge button (sebelumnya hilang), Dashboard button dihapus dari header
8. **Knowledge sidebar fix** — positioning bug yang bikin sidebar Knowledge nimpa konten lain

---

## Flow High-Level

```
UPLOAD:
  User → UploadDialog → POST /api/v1/documents/upload
                            ↓
                       DocumentService.create (DB row + simpan file)
                            ↓
                       POST /v1/documents/index ke AI service (fire-and-forget)
                            ↓
                       Parse → chunk → embed → write ke Qdrant collection "documents"
                            ↓
                       UI poll GET /api/v1/documents/[id]/status

ASK:
  User pilih dokumen di SourcesPanel → simpan ke document_selection table
  User tanya pertanyaan → askingService kirim selected_document_ids ke AI service
                            ↓
                       Intent classification: kalau ada selected_document_ids
                                               → route ke document_answer pipeline
                            ↓
                       Retrieval: query Qdrant "documents" filter document_id IN selected
                            ↓
                       LLM generate answer + citations → stream balik ke UI
```

---

## Backend (analytics-ai-service)

### Core Document Module

| File | Tujuan |
|---|---|
| `src/core/document/parser.py` | Parse PDF/DOCX/PPTX/XLSX/MD/HTML/TXT pakai `unstructured` library |
| `src/core/document/chunker.py` | Token-aware chunking dengan overlap (default: 800 token, 150 overlap) |
| `src/core/document/hash.py` | SHA-256 hash file content untuk deduplication |

### Pipelines (Hamilton)

| File | Tujuan |
|---|---|
| `src/pipelines/indexing/documents.py` | parse → chunk → embed → write ke Qdrant collection `documents`. Meta tiap chunk: `document_id`, `filename`, `page`, `chunk_index`, `project_id` |
| `src/pipelines/retrieval/documents.py` | Embed query, query Qdrant dengan filter `document_id IN [...]` + `project_id`. Output flat list of dicts untuk prompt |
| `src/pipelines/generation/document_answer.py` | LLM call yang generate jawaban berbasis chunks yang di-retrieve. Output: markdown answer + citations array |

### Pipeline Existing yang Dimodifikasi

| File | Perubahan |
|---|---|
| `src/pipelines/generation/intent_classification.py` | Skip classification dan route langsung ke document_answer kalau request bawa `selected_document_ids` |
| `src/web/v1/services/ask.py` | Terima `selected_document_ids` dari request body, branch ke document_answer kalau ada |
| `src/pipelines/generation/sql_answer.py` | Prompt diperluas untuk mention dokumen sebagai sumber (kalau ada document context) |

### Web Layer

| File | Tujuan |
|---|---|
| `src/web/v1/services/documents.py` | Service: `index_document(document_id, project_id, file_path, filename)`, `delete_document(document_id)` |
| `src/web/v1/routers/documents.py` | FastAPI router: `POST /v1/documents/index`, `DELETE /v1/documents/{id}` |

### Config

`config.yaml` — tambah dua pipeline entries:
```yaml
- name: documents_indexing
  embedder: litellm_embedder.default
  document_store: qdrant
- name: documents_retrieval
  embedder: litellm_embedder.default
  document_store: qdrant
```

### Dependencies (`pyproject.toml`)

- `unstructured[pdf,docx,pptx,xlsx]` — multi-format document parsing
- `pypdf` atau `pdfplumber` — PDF extraction backend
- `tiktoken` — token counting untuk chunking

---

## Frontend (analytics-ui)

### Database Migrations

| Migration | Tabel | Kolom utama |
|---|---|---|
| `create_document_table.js` | `document` | id, project_id, filename, original_filename, storage_path, mime_type, size, hash, status (parsing/parsed/indexed/failed), error_message, indexed_at |
| `create_document_selection_table.js` | `document_selection` | id, thread_id, document_id — tracks dokumen mana yang aktif untuk thread tertentu |

### Storage

| File | Tujuan |
|---|---|
| `src/apollo/server/utils/documentStorage.ts` | Storage abstraction. Default: `analytics-ui/storage/documents/{projectId}/{hash}{ext}`. Method: `save`, `remove`, `absolutePath` |

### Repositories & Services

| File | Tujuan |
|---|---|
| `src/apollo/server/repositories/documentRepository.ts` | CRUD + `findByProject`, `findByIds`, `updateStatus` |
| `src/apollo/server/repositories/documentSelectionRepository.ts` | `setSelection(threadId, documentIds)`, `getSelection(threadId)` |
| `src/apollo/server/services/documentService.ts` | Business logic: create (upload), delete, getByProject, setThreadSelection. Validasi size/extension whitelist |
| `src/apollo/server/adaptors/analyticsAIAdaptor.ts` | Tambah method `indexDocument(documentId, projectId, filePath, filename)` dan `deleteDocument(documentId)` |

### REST Endpoints

| Route | Method | Tujuan |
|---|---|---|
| `/api/v1/documents/upload` | POST | multipart/form-data upload. Validasi extension, hash file, simpan storage, panggil AI service untuk index |
| `/api/v1/documents/[id]/status` | GET | Polling endpoint untuk progress indexing |
| `/api/v1/documents/ask` | POST | Direct ask endpoint untuk document Q&A (bypass GraphQL untuk streaming) |

### GraphQL Schema

```graphql
type Document {
  id: Int!
  filename: String!
  status: DocumentStatus!
  size: Int!
  createdAt: String!
}
enum DocumentStatus { PARSING PARSED INDEXED FAILED }

type Query {
  documents(projectId: Int!): [Document!]!
}
type Mutation {
  deleteDocument(id: Int!): Boolean!
  setDocumentSelection(threadId: Int!, documentIds: [Int!]!): Boolean!
}
```

### UI Components

| File | Tujuan |
|---|---|
| `src/components/sources/SourcesPanel.tsx` | Panel sidebar daftar dokumen project. Checkbox per dokumen menentukan context aktif. Server adalah source of truth |
| `src/components/sources/UploadDialog.tsx` | Modal upload — drag-drop atau browse, multipart POST ke upload endpoint |
| `src/components/sources/SourceItem.tsx` | Item dokumen individual: icon by extension, status badge, delete button |

### Hooks

| File | Tujuan |
|---|---|
| `src/hooks/useDocumentContext.tsx` | React Context untuk `selectedDocumentIds: number[]`. **Tidak persist ke localStorage** — server sebagai source of truth (stale localStorage bisa kirim ID dokumen yang sudah di-reindex). Punya `getSnapshot()` untuk akses sync di submit handler |
| `src/hooks/useAskPrompt.tsx` | **Modified:** `onSubmit` baca `selectedDocumentIds` dari context, kirim ke askingService |

### Pages

| File | Perubahan |
|---|---|
| `src/pages/home/[id].tsx` | Layout dua panel: chat + SourcesPanel |
| `src/pages/_app.tsx` | Wrap dengan `DocumentProvider` |

### Dependencies (`package.json`)

- `formidable` — multipart form handling untuk upload endpoint

---

## Qdrant Collection Layout

| Collection | Type filter | Isi |
|---|---|---|
| `documents` | (no type filter) | **Document chunks**. Meta: `document_id`, `filename`, `page`, `chunk_index`, `project_id` |
| `Document` (default) | `TABLE_SCHEMA` | DDL chunks dari MDL — full schema per tabel. **Critical** untuk SQL generation |
| `table_descriptions` | `TABLE_DESCRIPTION` | Natural language description per tabel — untuk intent classification "tabel mana yang relevan" |

Collection `documents` (lowercase, plural) adalah collection baru untuk RAG — terpisah dari collection schema database.

---

## UI Layout Improvements

### Sidebar dengan Independent Scroll

**Problem sebelumnya:** Sidebar di home page hanya punya satu scroll container untuk seluruh sidebar — kalau dashboard banyak, history chat ke-push ke bawah dan harus scroll panjang. Documents list juga ikut scroll bareng.

**Solution:** Sidebar dibagi tiga section dengan **fixed header + independent scrollable content** masing-masing:

```
┌─────────────────────────────────────┐
│ HeaderBar (logo, nav buttons)       │ ← fixed
├─────────────────────────────────────┤
│ My Dashboards (count)        + New  │ ← fixed header
│ ┌─────────────────────────────────┐ │
│ │ Dashboard 1                     │ │
│ │ Dashboard 2                     │ │ ← scroll
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ History (count)                     │ ← fixed header
│ ┌─────────────────────────────────┐ │
│ │ Thread 1                        │ │
│ │ Thread 2                        │ │ ← scroll
│ │ ...                             │ │
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ Sources                             │ ← fixed header
│ ┌─────────────────────────────────┐ │
│ │ ☐ Document 1                    │ │
│ │ ☐ Document 2                    │ │ ← scroll
│ └─────────────────────────────────┘ │
├─────────────────────────────────────┤
│ UserMenu                            │ ← fixed
└─────────────────────────────────────┘
```

### Implementasi

| File | Perubahan |
|---|---|
| `src/components/sidebar/Home.tsx` | Layout di-restructure pakai flexbox: `HomeContainer` (column flex), `Section` (flex grow + `min-height: 0` untuk allow shrinking), `SectionHeader` (flex-shrink: 0), `ScrollContent` (flex: 1 + `overflow-y: auto`). Section dashboard dapat `$flex={1}`, history dapat `$flex={2}` (history dapat 2× ruang vs dashboard) |
| `src/components/sidebar/index.tsx` | Outer Layout pakai `overflow-y: hidden` (bukan auto). Content container terima prop `$noScroll` — di home page, scroll dimatikan di parent karena tiap section punya scroll sendiri. Render `<SourcesPanel>` di luar Content kalau pathname adalah home |
| `src/components/sidebar/home/DashboardTree.tsx` | Tambah prop `hideHeader?: boolean`. Kalau true, filter out tree node dengan className `adm-treeNode--group` (yang awalnya menampilkan header tree bawaan). Header sekarang di-render di `Home.tsx` sebagai `<SectionHeader>` |
| `src/components/sidebar/home/ThreadTree.tsx` | Sama — prop `hideHeader?: boolean` untuk skip group header dari tree. Header section dipindah ke `Home.tsx` |

### Kunci CSS yang Penting

Setiap level dalam flex chain harus punya `min-height: 0`, kalau tidak children dengan `overflow: auto` tidak akan shrink dan scroll tidak jalan:

```css
/* Layout */
overflow-y: hidden;

/* Content */
flex: 1 1 auto;
min-height: 0;
display: flex;
flex-direction: column;

/* Section */
flex: ${flex} 1 0;
min-height: 0;

/* ScrollContent */
flex: 1 1 0;
min-height: 0;
overflow-y: auto;
```

---

## HeaderBar Fixes

### Icon Knowledge button

Sebelumnya icon di button "Knowledge" tidak muncul (cuma teks). Tambahkan `<BookOpen />` icon dari lucide-react.

### Dashboard button dihapus

Dashboard button di header dihapus karena sudah ada akses ke dashboards via Sidebar (My Dashboards section).

### File

`src/components/HeaderBar.tsx`:
```tsx
// Sebelum
import { ChartPie, Database, SquarePen } from 'lucide-react';
// Sesudah
import { BookOpen, Database, SquarePen } from 'lucide-react';

// Dashboard button — DIHAPUS

// Knowledge button — TAMBAH icon
<StyledButton ...>
  <BookOpen size={16} className="mr-1" />
  Knowledge
</StyledButton>
```

---

## Knowledge Sidebar Positioning Fix

**Problem:** Sidebar di halaman Knowledge pakai `position: absolute` dengan `z-index: 1` — efeknya sidebar floating dan menimpa elemen lain di layout (terutama main content area kalau sidebar lebih panjang dari viewport).

**Fix:** Hapus absolute positioning. Sidebar sekarang flow normal di dalam parent flex container.

`src/components/sidebar/Knowledge.tsx`:
```css
/* Sebelum */
const Layout = styled.div`
  padding: 16px 0;
  position: absolute;        /* ❌ */
  z-index: 1;                /* ❌ */
  left: 0;                   /* ❌ */
  top: 0;                    /* ❌ */
  width: 100%;
  background-color: var(--gray-2);
  overflow: hidden;
`;

/* Sesudah */
const Layout = styled.div`
  padding: 16px 0;
  width: 100%;
  background-color: var(--gray-2);
  overflow: hidden;
`;
```

---

## Less Config Fix (Dev vs Production Tampilan Beda)

**Problem:** Tampilan di mode dev (`yarn dev`) dan production (`yarn build`) berbeda — beberapa antd custom variables tidak ter-apply di production build, atau global `@import` ke `antd-variables.less` gagal resolve di webpack production.

**Root cause:** `additionalData` di lessLoaderOptions pakai relative path `@/styles/antd-variables.less`. Webpack alias `@` di-resolve dengan baik di dev tapi di production less compilation context-nya beda dan path tidak ketemu.

**Fix:** Pakai absolute path yang di-resolve via `path.resolve(__dirname, ...)`, plus tambah explicit `paths` di lessOptions supaya less compiler tahu lokasi mana saja yang harus dicari saat resolve `@import`.

### File

`analytics-ui/next.config.js`:

```js
// Sebelum
lessLoaderOptions: {
  additionalData: `@import "@/styles/antd-variables.less";`,
},

// Sesudah
lessLoaderOptions: {
  additionalData: `@import "${path
    .resolve(__dirname, 'src/styles/antd-variables.less')
    .replace(/\\/g, '/')}";`,
  lessOptions: {
    javascriptEnabled: true,
    paths: [
      path.resolve(__dirname, 'node_modules'),
      path.resolve(__dirname, 'src/styles'),
    ],
  },
},
```

**Penjelasan:**
- `path.resolve(__dirname, 'src/styles/antd-variables.less')` → absolute path yang konsisten dev maupun production
- `.replace(/\\/g, '/')` → Windows backslash → forward slash karena less importer expect POSIX-style paths
- `lessOptions.paths` → daftar directory tempat less mencari `@import` paths. Tambah `node_modules` (untuk antd built-in less) dan `src/styles` (untuk custom variables)
- `javascriptEnabled: true` → required oleh antd less karena pakai inline JS expressions di beberapa variable definitions

### File `.less` yang Terdampak

- `src/styles/antd-variables.less` — antd theme overrides
- `src/styles/index.less` — global stylesheet

Setelah fix ini, build production akan punya tampilan yang sama persis dengan dev.

---

## Konfigurasi yang Perlu Disesuaikan

### `.env` (root, untuk docker-compose)

```env
OPENAI_API_KEY=sk-...     # WAJIB valid; "dummy" tidak akan jalan
```

### `analytics-ai-service/.env.dev` (untuk run lokal)

```env
OPENAI_API_KEY=sk-...
```

AI service baca file ini via `load_dotenv(".env.dev", override=True)` di `src/config.py`. Dua file harus sinkron.

### `config.yaml`

Setting yang perlu dinaikkan dari default:

```yaml
settings:
  engine_timeout: 120        # default 30 — terlalu rendah untuk SQL generation kompleks

models:
  - alias: default
    kwargs:
      max_tokens: 16384      # default 4096 — bisa truncate JSON response untuk query kompleks
```

---

## Common Pitfalls

1. **`OPENAI_API_KEY=dummy`** → Indexing akan silently fail dengan AuthenticationError. Validate dulu:
   ```bash
   curl https://api.openai.com/v1/models -H "Authorization: Bearer $KEY"
   ```

2. **`project_id` type mismatch di Qdrant filter** → Selalu cast ke string. AI service menyimpan sebagai string.

3. **`document_id` filter di retrieval** → Pakai snake_case (`document_id`), bukan `documentId`. Konsisten dengan meta yang ditulis saat indexing.

4. **SQL generation timeout 30 detik** → Naikkan `engine_timeout` di `config.yaml` ke 120.

5. **`max_tokens: 4096` di LLM config** → Response JSON bisa truncate untuk query kompleks. Naikkan ke 16384.

6. **Selected dokumen IDs persist di localStorage** → Stale ID yang sudah di-reindex bisa dikirim. Server harus jadi source of truth, jangan persist di client.

---

## File Structure Reference

```
analytics-ui/
├── next.config.js                                   [modified: less paths + absolute additionalData]
├── migrations/
│   ├── ..._create_document_table.js
│   └── ..._create_document_selection_table.js
└── src/
    ├── apollo/server/
    │   ├── repositories/
    │   │   ├── documentRepository.ts
    │   │   └── documentSelectionRepository.ts
    │   ├── services/documentService.ts
    │   ├── adaptors/analyticsAIAdaptor.ts          [+indexDocument, +deleteDocument]
    │   └── utils/documentStorage.ts
    ├── components/
    │   ├── HeaderBar.tsx                            [modified: BookOpen icon, hapus Dashboard btn]
    │   ├── sidebar/
    │   │   ├── index.tsx                            [modified: noScroll on home, render SourcesPanel]
    │   │   ├── Home.tsx                             [restructured: 3 section dengan independent scroll]
    │   │   ├── Knowledge.tsx                        [fix: hapus position absolute]
    │   │   └── home/
    │   │       ├── DashboardTree.tsx                [+hideHeader prop]
    │   │       └── ThreadTree.tsx                   [+hideHeader prop]
    │   └── sources/
    │       ├── SourcesPanel.tsx
    │       ├── UploadDialog.tsx
    │       └── SourceItem.tsx
    ├── hooks/
    │   ├── useDocumentContext.tsx
    │   └── useAskPrompt.tsx                        [modified: pass selectedDocumentIds]
    └── pages/
        ├── _app.tsx                                [wire DocumentProvider]
        ├── home/[id].tsx                           [SourcesPanel layout]
        └── api/v1/
            └── documents/
                ├── upload.ts
                ├── ask.ts
                └── [id]/status.ts

analytics-ai-service/
├── src/
│   ├── core/document/
│   │   ├── parser.py
│   │   ├── chunker.py
│   │   └── hash.py
│   ├── pipelines/
│   │   ├── indexing/documents.py
│   │   ├── retrieval/documents.py
│   │   └── generation/
│   │       ├── document_answer.py
│   │       ├── intent_classification.py            [modified: route by selected_document_ids]
│   │       └── sql_answer.py                       [modified: include doc context]
│   └── web/v1/
│       ├── routers/documents.py
│       └── services/
│           ├── documents.py
│           └── ask.py                              [modified: accept selected_document_ids]
├── tests/                                          [unit + integration untuk document module]
└── pyproject.toml                                  [+unstructured, +pypdf, +tiktoken]
```

---

## Recommended Build Order

1. **Backend dulu** — buat document module di AI service (parser, chunker, indexing, retrieval, document_answer pipeline). Test dengan pytest.
2. **Endpoint AI service** — `/v1/documents/index`, `/v1/documents/{id}` (delete).
3. **DB migrations** di UI — `document` + `document_selection` tables.
4. **Server-side UI** — documentStorage, repositories, documentService, modify analyticsAIAdaptor.
5. **REST endpoints** — upload, status, ask.
6. **GraphQL** — schema additions, resolvers.
7. **UI components** — SourcesPanel, UploadDialog, SourceItem.
8. **Document context** — `useDocumentContext`, wire ke `_app.tsx`.
9. **Wire ke ask flow** — modify `useAskPrompt` supaya kirim `selectedDocumentIds`. Modify backend `ask.py` + `intent_classification.py` untuk route ke document_answer.
10. **Sidebar restructure** — modify `Home.tsx` untuk 3 section dengan independent scroll. Tambah `hideHeader` prop di `DashboardTree` dan `ThreadTree`. Update sidebar `index.tsx` untuk render `SourcesPanel` di home.
11. **HeaderBar fixes** — tambah `BookOpen` icon di Knowledge button, hapus Dashboard button.
12. **Knowledge sidebar fix** — hapus `position: absolute` dari Knowledge sidebar Layout.
13. **Less config fix** — update `next.config.js` dengan absolute path dan `lessOptions.paths`. Verify dev dan production tampilan sama.
14. **Polish** — naikkan `engine_timeout` dan `max_tokens` di `config.yaml`.

Step 1-2 dan step 3-4 bisa parallel. Step 10-13 (UI fixes) bisa dikerjakan parallel.
