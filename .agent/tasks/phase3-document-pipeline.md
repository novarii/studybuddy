# Phase 3 Tasks: Document Pipeline

**Spec Reference:** [03-document-pipeline.md](../specs/migration/03-document-pipeline.md)

## Task Overview

| Task | Description | Dependencies | Effort |
|------|-------------|--------------|--------|
| 1 | Project Setup | None | Small |
| 2 | PDF Processing Core | Task 1 | Medium |
| 3 | Gemini Extraction | Task 1 | Medium |
| 4 | Deduplication & Embedding | Task 3 | Medium |
| 5 | API Routes | Tasks 2, 4 | Medium |
| 6 | Testing & Validation | Task 5 | Medium |

---

## Task 1: Project Setup

**Goal:** Install dependencies, add database schema, create storage utilities.

### Subtasks - Dependencies
- [x] 1.1 Install `pdf-lib` for PDF manipulation
- [x] 1.2 Install `p-limit` for concurrency control
- [x] 1.3 Verify `ai` package version supports `mediaType` (v5+)

### Subtasks - Database Schema
- [x] 1.4 Add `documents` table to `lib/db/schema.ts`
- [x] 1.5 Generate migration with `drizzle-kit generate`
- [x] 1.6 Run migration against dev database
- [x] 1.7 Verify table created with checksum unique constraint
- [x] 1.8 Export `documents` from `lib/db/index.ts`

### Schema Definition
```typescript
export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  courseId: uuid('course_id').notNull(),
  filename: text('filename').notNull(),
  checksum: text('checksum').notNull().unique(),
  status: text('status').notNull().default('processing'),
  pageCount: integer('page_count'),
  uniquePageCount: integer('unique_page_count'),
  failedPages: jsonb('failed_pages').$type<number[]>(),
  errorMessage: text('error_message'),
  filePath: text('file_path').notNull(),
  processedFilePath: text('processed_file_path'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});
```

### Subtasks - Storage
- [x] 1.9 Create `lib/storage/documents.ts` with storage utilities
- [x] 1.10 Implement `storeDocument()` - save PDF to disk
- [x] 1.11 Implement `getDocumentPath()` - retrieve file path
- [x] 1.12 Implement `deleteDocument()` - remove files
- [x] 1.13 Add `DOCUMENT_STORAGE_PATH` to environment config

### Environment Variables
```bash
DOCUMENT_STORAGE_PATH=./uploads/documents
```

### Deliverables
- Updated `package.json` with new dependencies
- `lib/db/schema.ts` with `documents` table
- `drizzle/migrations/` - New migration file
- `lib/storage/documents.ts` - Storage utilities
- `lib/storage/index.ts` - Exports

---

## Task 2: PDF Processing Core

**Goal:** Implement PDF splitting and lean PDF rebuilding with pdf-lib.

### Subtasks
- [x] 2.1 Create `lib/documents/pdf-splitter.ts`
- [x] 2.2 Implement `splitPdfIntoPages()` - split PDF into single-page Uint8Arrays
- [x] 2.3 Create `lib/documents/pdf-rebuilder.ts`
- [x] 2.4 Implement `rebuildPdfWithoutPages()` - create lean PDF excluding duplicate pages
- [x] 2.5 Create `lib/documents/checksum.ts`
- [x] 2.6 Implement `computeChecksum()` - SHA-256 hash of PDF bytes
- [x] 2.7 Write unit tests for PDF splitting (use test PDF fixture)
- [x] 2.8 Write unit tests for PDF rebuilding
- [x] 2.9 Write unit tests for checksum computation

### Implementation Notes
- All operations in-memory (no temp files)
- pdf-lib returns `Uint8Array` for page bytes
- Checksum uses Node.js `crypto.createHash('sha256')`

### Deliverables
- `lib/documents/pdf-splitter.ts`
- `lib/documents/pdf-rebuilder.ts`
- `lib/documents/checksum.ts`
- `lib/documents/index.ts` - Exports
- `__tests__/lib/documents/pdf-splitter.test.ts`
- `__tests__/lib/documents/pdf-rebuilder.test.ts`
- `__tests__/lib/documents/checksum.test.ts`
- `__tests__/fixtures/test.pdf` - Test PDF fixture

---

## Task 3: Gemini Extraction

**Goal:** Implement parallel page extraction using Gemini via OpenRouter.

### Subtasks
- [ ] 3.1 Create `lib/documents/gemini-extractor.ts`
- [ ] 3.2 Implement `extractPageContent()` - single page extraction
- [ ] 3.3 Define extraction prompt placeholder (user will finalize)
- [ ] 3.4 Create `lib/documents/page-processor.ts`
- [ ] 3.5 Implement `processPages()` - parallel processing with p-limit (concurrency: 5)
- [ ] 3.6 Implement retry logic (1 retry on failure)
- [ ] 3.7 Implement skip + log on final failure
- [ ] 3.8 Add BYOK integration (get user's API key)
- [ ] 3.9 Write unit tests with mocked Gemini responses

### Implementation Notes
```typescript
// Gemini expects this format (AI SDK v5+)
{
  type: 'file',
  data: pageBytes,        // Uint8Array from pdf-lib
  mediaType: 'application/pdf',
}
```

### Concurrency Control
```typescript
import pLimit from 'p-limit';
const limit = pLimit(5);  // 5 concurrent requests
```

### Deliverables
- `lib/documents/gemini-extractor.ts`
- `lib/documents/page-processor.ts`
- `__tests__/lib/documents/gemini-extractor.test.ts`
- `__tests__/lib/documents/page-processor.test.ts`

---

## Task 4: Deduplication & Embedding

**Goal:** Implement Jaccard deduplication and embedding generation.

### Subtasks - Deduplication
- [ ] 4.1 Create `lib/documents/deduplication.ts`
- [ ] 4.2 Implement `jaccardSimilarity()` - word-set similarity
- [ ] 4.3 Implement `deduplicatePages()` - filter pages above 90% similarity
- [ ] 4.4 Write unit tests for Jaccard similarity edge cases
- [ ] 4.5 Write unit tests for deduplication logic

### Subtasks - Embedding & Storage
- [ ] 4.6 Create `lib/documents/chunk-ingestion.ts`
- [ ] 4.7 Implement `generateChunkEmbeddings()` - batch embed unique pages
- [ ] 4.8 Implement `insertChunks()` - insert into `ai.slide_chunks_knowledge`
- [ ] 4.9 Reuse existing `lib/ai/embeddings.ts` for OpenRouter embeddings
- [ ] 4.10 Write unit tests for chunk ingestion (mock DB)

### Similarity Threshold
```typescript
const SIMILARITY_THRESHOLD = 0.9;  // 90% similar = duplicate
```

### Deliverables
- `lib/documents/deduplication.ts`
- `lib/documents/chunk-ingestion.ts`
- `__tests__/lib/documents/deduplication.test.ts`
- `__tests__/lib/documents/chunk-ingestion.test.ts`

---

## Task 5: API Routes

**Goal:** Implement document CRUD endpoints with async processing.

### Subtasks - Pipeline Orchestration
- [ ] 5.1 Create `lib/documents/pipeline.ts`
- [ ] 5.2 Implement `processDocument()` - full async pipeline orchestration
- [ ] 5.3 Implement status updates throughout pipeline
- [ ] 5.4 Implement error handling and status: 'failed'

### Subtasks - Upload Endpoint
- [ ] 5.5 Create `app/api/documents/route.ts` (POST - upload)
- [ ] 5.6 Implement multipart form-data parsing
- [ ] 5.7 Implement file validation (PDF only, size limit)
- [ ] 5.8 Implement checksum computation and duplicate check
- [ ] 5.9 Store original PDF and create document record
- [ ] 5.10 Trigger async processing (don't await)
- [ ] 5.11 Return 202 Accepted with document ID

### Subtasks - List Endpoint
- [ ] 5.12 Implement GET handler in `app/api/documents/route.ts`
- [ ] 5.13 Filter by courseId (required)
- [ ] 5.14 Return document list with status

### Subtasks - Detail/Status Endpoint
- [ ] 5.15 Create `app/api/documents/[id]/route.ts` (GET - status)
- [ ] 5.16 Return document details including processing status
- [ ] 5.17 Implement DELETE handler - remove document + chunks + files

### Subtasks - File Download Endpoint
- [ ] 5.18 Create `app/api/documents/[id]/file/route.ts` (GET - download)
- [ ] 5.19 Stream processed PDF (or original if not yet processed)
- [ ] 5.20 Set correct Content-Type and Content-Disposition headers

### Subtasks - Auth & Validation
- [ ] 5.21 Add Clerk auth checks to all endpoints
- [ ] 5.22 Add ownership verification (user can only access own documents)
- [ ] 5.23 Add course ownership verification

### Endpoint Summary
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/documents` | Upload PDF, start async processing |
| GET | `/api/documents` | List documents for a course |
| GET | `/api/documents/[id]` | Get document status/details |
| DELETE | `/api/documents/[id]` | Delete document + chunks |
| GET | `/api/documents/[id]/file` | Download processed PDF |

### Deliverables
- `lib/documents/pipeline.ts`
- `app/api/documents/route.ts`
- `app/api/documents/[id]/route.ts`
- `app/api/documents/[id]/file/route.ts`

---

## Task 6: Testing & Validation

**Goal:** Comprehensive testing of document pipeline.

### Subtasks - Unit Tests
- [ ] 6.1 Verify all unit tests from Tasks 2-4 pass
- [ ] 6.2 Add edge case tests (empty PDF, single page, 100+ pages)
- [ ] 6.3 Test checksum duplicate detection
- [ ] 6.4 Test pipeline error handling and status transitions

### Subtasks - Integration Tests
- [ ] 6.5 Test upload endpoint with mock file
- [ ] 6.6 Test duplicate rejection (409 response)
- [ ] 6.7 Test list endpoint filtering
- [ ] 6.8 Test delete endpoint cascades (files + chunks)
- [ ] 6.9 Test file download endpoint

### Subtasks - E2E Tests
- [ ] 6.10 E2E test: upload small PDF (authenticated)
- [ ] 6.11 E2E test: poll status until completed
- [ ] 6.12 E2E test: download processed PDF
- [ ] 6.13 E2E test: delete document
- [ ] 6.14 E2E test: duplicate upload rejected

### Subtasks - Manual Testing
- [ ] 6.15 Test with real multi-page PDF
- [ ] 6.16 Verify duplicates removed from lean PDF
- [ ] 6.17 Verify chunks searchable via chat RAG
- [ ] 6.18 Test with user's BYOK key

### Deliverables
- `__tests__/api/documents/*.test.ts`
- `e2e/tests/document-upload.spec.ts`
- Test fixtures in `__tests__/fixtures/`

---

## Execution Order

```
Task 1 (Project Setup)
    ↓
    ├── Task 2 (PDF Processing) ──────┐
    │                                  │
    └── Task 3 (Gemini Extraction) ───┤
                ↓                      │
        Task 4 (Dedup & Embedding)     │
                ↓                      │
        Task 5 (API Routes) ←──────────┘
                ↓
        Task 6 (Testing & Validation)
```

Tasks 2 and 3 can run in parallel after Task 1 completes.

---

## Definition of Done

Phase 3 is complete when:
- [ ] All 6 tasks marked complete
- [ ] PDF upload works end-to-end
- [ ] Duplicate pages detected and removed
- [ ] Lean PDF downloadable
- [ ] Chunks searchable via existing chat RAG
- [ ] BYOK integration works
- [ ] All unit tests pass
- [ ] All E2E tests pass
- [ ] No calls to Python backend for documents

---

## Performance Checklist

- [ ] Parallel processing uses p-limit (concurrency: 5)
- [ ] In-memory processing (no temp files)
- [ ] Deduplication runs before embedding (cost savings)
- [ ] Async processing doesn't block upload response

---

## Notes

- Frontend integration (upload UI) deferred to separate task
- Max file size TBD (suggest 10-20MB)
- Rate limit handling (429) can be added as enhancement
- Extraction prompt is placeholder - user will finalize
