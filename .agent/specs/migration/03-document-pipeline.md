# Phase 3: Document Pipeline

**Status:** Draft

## Overview

Migrate PDF document processing from Python to Node.js/TypeScript. Key improvements over Python implementation:

1. **Native PDF support** - Gemini LLM reads PDFs directly (no image conversion)
2. **Parallel processing** - Process 5 pages concurrently (configurable)
3. **Smart deduplication** - Skip similar slides before embedding (cost savings)
4. **Async pipeline** - Non-blocking upload with background processing

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         Document Upload Flow                             │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. Upload PDF                                                           │
│     POST /api/documents                                                  │
│     └─► Validate file (size, type)                                       │
│     └─► Compute SHA-256 checksum                                         │
│     └─► Check if checksum exists in DB ──► 409 Conflict if duplicate    │
│     └─► Store original PDF to persistent storage                         │
│     └─► Create document record (status: "processing")                    │
│     └─► Queue async processing job                                       │
│     └─► Return 202 Accepted { documentId, status: "processing" }         │
│                                                                          │
│  2. Async Processing Pipeline                                            │
│     └─► Split PDF into single-page PDFs (pdf-lib, in-memory)            │
│     └─► Process pages in parallel (concurrency: 5)                       │
│         ├─► Send page PDF to Gemini (google/gemini-2.5-flash-lite)      │
│         ├─► Extract content/description                                  │
│         ├─► On failure: retry once, then skip + log                      │
│         └─► Return extracted text                                        │
│     └─► Deduplicate (Jaccard similarity on extracted text)              │
│     └─► Generate embeddings for unique pages                             │
│     └─► Insert chunks into pgvector                                      │
│     └─► Rebuild lean PDF (remove duplicate pages)                        │
│     └─► Update document record (status: "completed")                     │
│                                                                          │
│  3. Status Polling                                                       │
│     GET /api/documents/:id                                               │
│     └─► Return { status, progress?, error? }                            │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

## Technical Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| PDF library | `pdf-lib` | Lightweight, good for splitting/rebuilding |
| LLM for extraction | `google/gemini-2.5-flash-lite` | Native PDF support, fast, cheap |
| Processing mode | In-memory | PDFs are 2-5MB max, cheaper than temp files on cloud |
| Concurrency | 5 pages | Balance speed vs rate limits (configurable) |
| Deduplication | Jaccard similarity | Fast, no dependencies, saves embedding cost |
| Duplicate threshold | 90% | Catches near-duplicates while allowing minor variations |
| Error handling | 1 retry, then skip | Don't kill pipeline for single page failure |
| Re-upload policy | Reject via checksum | SHA-256 hash checked before processing |
| Chunking | 1 chunk per unique slide | Slides are self-contained units |
| Storage | Persistent (show to users) | Users need to access uploaded PDFs |

## API Endpoints

### POST /api/documents

Upload a new document.

**Request:**
```
Content-Type: multipart/form-data

file: <PDF file>
courseId: string
```

**Response (202 Accepted):**
```json
{
  "id": "doc_abc123",
  "filename": "lecture-notes.pdf",
  "status": "processing",
  "pageCount": 50,
  "createdAt": "2024-01-15T10:30:00Z"
}
```

**Response (409 Conflict - duplicate):**
```json
{
  "error": "Document already exists",
  "existingDocumentId": "doc_xyz789"
}
```

### GET /api/documents

List documents for a course.

**Query params:**
- `courseId` (required): Filter by course

**Response:**
```json
{
  "documents": [
    {
      "id": "doc_abc123",
      "filename": "lecture-notes.pdf",
      "status": "completed",
      "pageCount": 50,
      "uniquePageCount": 42,
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### GET /api/documents/:id

Get document details and processing status.

**Response:**
```json
{
  "id": "doc_abc123",
  "filename": "lecture-notes.pdf",
  "status": "completed",
  "pageCount": 50,
  "uniquePageCount": 42,
  "duplicatesRemoved": 8,
  "failedPages": [23],
  "fileUrl": "/api/documents/doc_abc123/file",
  "createdAt": "2024-01-15T10:30:00Z",
  "processedAt": "2024-01-15T10:31:45Z"
}
```

**Status values:**
- `processing` - Pipeline running
- `completed` - Successfully processed
- `failed` - Pipeline failed (with error details)

### GET /api/documents/:id/file

Download the processed PDF (lean version with duplicates removed).

**Response:** PDF file stream

### DELETE /api/documents/:id

Delete a document and its chunks.

## Database Schema

### Existing Tables (no changes needed)

```sql
-- documents table (public schema)
-- Already exists, may need to verify columns

-- ai.slide_chunks_knowledge (pgvector)
-- Already exists with embeddings
```

### New/Modified Schema

```typescript
// lib/db/schema.ts additions

export const documents = pgTable('documents', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  courseId: uuid('course_id').notNull(),
  filename: text('filename').notNull(),
  checksum: text('checksum').notNull().unique(), // SHA-256
  status: text('status').notNull().default('processing'),
  // 'processing' | 'completed' | 'failed'
  pageCount: integer('page_count'),
  uniquePageCount: integer('unique_page_count'),
  failedPages: jsonb('failed_pages').$type<number[]>(),
  errorMessage: text('error_message'),
  filePath: text('file_path').notNull(), // Storage path
  processedFilePath: text('processed_file_path'), // Lean PDF path
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  processedAt: timestamp('processed_at', { withTimezone: true }),
});

// Index for duplicate checking
// CREATE UNIQUE INDEX idx_documents_checksum ON documents(checksum);
```

## Processing Pipeline Implementation

### 1. PDF Splitting (pdf-lib)

```typescript
// lib/documents/pdf-splitter.ts
import { PDFDocument } from 'pdf-lib';

export async function splitPdfIntoPages(
  pdfBytes: Uint8Array
): Promise<Uint8Array[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const pages: Uint8Array[] = [];

  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(pdfDoc, [i]);
    newDoc.addPage(copiedPage);
    pages.push(await newDoc.save());
  }

  return pages;
}
```

### 2. Parallel Page Processing

```typescript
// lib/documents/page-processor.ts
import pLimit from 'p-limit';

const CONCURRENCY = 5;
const MAX_RETRIES = 1;

export async function processPages(
  pages: Uint8Array[],
  apiKey: string
): Promise<PageResult[]> {
  const limit = pLimit(CONCURRENCY);

  const results = await Promise.all(
    pages.map((page, index) =>
      limit(() => processPageWithRetry(page, index, apiKey))
    )
  );

  return results;
}

async function processPageWithRetry(
  pageBytes: Uint8Array,
  pageNumber: number,
  apiKey: string
): Promise<PageResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await extractPageContent(pageBytes, apiKey);
      return { pageNumber, content, success: true };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error(`Page ${pageNumber} failed after retry:`, error);
        return { pageNumber, content: null, success: false, error };
      }
      // Wait before retry
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
```

### 3. Gemini PDF Extraction

```typescript
// lib/documents/gemini-extractor.ts
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const EXTRACTION_PROMPT = `
[PLACEHOLDER - User will define extraction prompt]

Extract the content from this slide/page.
`;

export async function extractPageContent(
  pageBytes: Uint8Array,
  apiKey: string
): Promise<string> {
  const openrouter = createOpenRouter({ apiKey });

  const result = await generateText({
    model: openrouter('google/gemini-2.5-flash-lite'),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          {
            type: 'file',
            data: pageBytes,
            mediaType: 'application/pdf',  // AI SDK v5+ uses mediaType, not mimeType
          },
        ],
      },
    ],
  });

  return result.text;
}
```

### 4. Deduplication (Jaccard Similarity)

```typescript
// lib/documents/deduplication.ts

const SIMILARITY_THRESHOLD = 0.9;

export function jaccardSimilarity(a: string, b: string): number {
  const normalize = (s: string) =>
    s.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);

  const setA = new Set(normalize(a));
  const setB = new Set(normalize(b));

  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 1; // Both empty = identical
  return intersection.size / union.size;
}

export function deduplicatePages(
  results: PageResult[]
): { unique: PageResult[]; duplicateIndices: number[] } {
  const unique: PageResult[] = [];
  const duplicateIndices: number[] = [];

  for (const result of results) {
    if (!result.success || !result.content) {
      // Keep failed pages in their position, don't mark as duplicate
      continue;
    }

    const isDuplicate = unique.some(
      u => u.content && jaccardSimilarity(u.content, result.content!) >= SIMILARITY_THRESHOLD
    );

    if (isDuplicate) {
      duplicateIndices.push(result.pageNumber);
    } else {
      unique.push(result);
    }
  }

  return { unique, duplicateIndices };
}
```

### 5. Rebuild Lean PDF

```typescript
// lib/documents/pdf-rebuilder.ts
import { PDFDocument } from 'pdf-lib';

export async function rebuildPdfWithoutDuplicates(
  originalPdfBytes: Uint8Array,
  duplicatePageIndices: number[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(originalPdfBytes);
  const pageCount = pdfDoc.getPageCount();

  // Get indices to keep (0-based)
  const duplicateSet = new Set(duplicatePageIndices);
  const pagesToKeep = Array.from({ length: pageCount }, (_, i) => i)
    .filter(i => !duplicateSet.has(i));

  if (pagesToKeep.length === pageCount) {
    // No duplicates, return original
    return originalPdfBytes;
  }

  // Create new PDF with only unique pages
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(pdfDoc, pagesToKeep);
  copiedPages.forEach(page => newDoc.addPage(page));

  return await newDoc.save();
}
```

### 6. Full Pipeline Orchestration

```typescript
// lib/documents/pipeline.ts

export async function processDocument(
  documentId: string,
  pdfBytes: Uint8Array,
  userId: string,
  courseId: string
): Promise<void> {
  try {
    // 1. Get user's API key (BYOK)
    const apiKey = await getUserApiKey(userId);

    // 2. Split PDF into pages
    const pages = await splitPdfIntoPages(pdfBytes);
    await updateDocumentStatus(documentId, { pageCount: pages.length });

    // 3. Process pages in parallel with Gemini
    const results = await processPages(pages, apiKey);

    // 4. Deduplicate
    const { unique, duplicateIndices } = deduplicatePages(results);

    // 5. Generate embeddings for unique pages
    const embeddings = await generateEmbeddings(
      unique.map(u => u.content!),
      apiKey
    );

    // 6. Insert into pgvector
    await insertChunks(documentId, courseId, unique, embeddings);

    // 7. Rebuild lean PDF
    const leanPdf = await rebuildPdfWithoutDuplicates(pdfBytes, duplicateIndices);
    const processedFilePath = await storePdf(leanPdf, `${documentId}-processed.pdf`);

    // 8. Update document record
    const failedPages = results
      .filter(r => !r.success)
      .map(r => r.pageNumber);

    await updateDocumentStatus(documentId, {
      status: 'completed',
      uniquePageCount: unique.length,
      failedPages: failedPages.length > 0 ? failedPages : null,
      processedFilePath,
      processedAt: new Date(),
    });

  } catch (error) {
    console.error(`Document ${documentId} processing failed:`, error);
    await updateDocumentStatus(documentId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
```

## Storage

### File Storage Strategy

- **Original PDF**: Always stored (users need access)
- **Processed PDF**: Stored after deduplication (lean version)
- **Individual pages**: In-memory only during processing (not persisted)

### Storage Location

```typescript
// lib/storage/documents.ts

// For local dev
const STORAGE_PATH = process.env.DOCUMENT_STORAGE_PATH || './uploads/documents';

// Structure:
// uploads/documents/{userId}/{documentId}/original.pdf
// uploads/documents/{userId}/{documentId}/processed.pdf

export async function storePdf(
  pdfBytes: Uint8Array,
  userId: string,
  documentId: string,
  type: 'original' | 'processed'
): Promise<string> {
  const dir = path.join(STORAGE_PATH, userId, documentId);
  await fs.mkdir(dir, { recursive: true });

  const filename = type === 'original' ? 'original.pdf' : 'processed.pdf';
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, pdfBytes);
  return filePath;
}
```

## Error Handling & Logging

### Page-Level Failures

```typescript
// Logged to console (can enhance with structured logging later)
console.error(`[DocumentPipeline] Page ${pageNumber} failed for doc ${documentId}:`, {
  error: error.message,
  attempt: attemptNumber,
});
```

### Document-Level Tracking

- `failedPages` array stored in document record
- `errorMessage` for catastrophic failures
- Status transitions: `processing` → `completed` | `failed`

## Environment Variables

```bash
# New variables for Phase 3
DOCUMENT_STORAGE_PATH=./uploads/documents  # Local storage path

# Existing (from Phase 2)
OPENROUTER_API_KEY=xxx        # Fallback if no BYOK
ENCRYPTION_KEY=xxx            # For decrypting user API keys
DATABASE_URL=xxx              # PostgreSQL
```

## Frontend Integration

### Upload Component

Simple file input with:
- Drag & drop support
- File type validation (PDF only)
- Size validation (configurable max)
- Upload progress indicator
- Spinner during processing
- Success/error toast notifications

### Document List

- Show documents per course
- Status badge (processing/completed/failed)
- Page count (original vs unique)
- Download link for processed PDF
- Delete action

## Testing Strategy

### Unit Tests
- PDF splitting (pdf-lib)
- Jaccard similarity calculation
- Deduplication logic
- PDF rebuilding

### Integration Tests
- Upload endpoint (multipart handling)
- Checksum duplicate detection
- Status endpoint responses
- File storage/retrieval

### E2E Tests
- Full upload flow (small test PDF)
- Document list display
- Download processed PDF
- Delete document

## Dependencies

```json
{
  "pdf-lib": "^1.17.1",
  "p-limit": "^5.0.0"
}
```

Note: `p-limit` v5+ is ESM-only. If CJS needed, use v4.

## Migration Notes

### From Python Backend

The Python backend has:
- `documents_service.py` - CRUD operations
- `document_chunk_pipeline.py` - Processing logic

This spec replaces both with:
- `/api/documents/*` routes
- `lib/documents/*` processing modules

### Database Compatibility

- Uses same `ai.slide_chunks_knowledge` table for vectors
- New `documents` table replaces Python's document tracking
- Checksums enable duplicate detection across systems

## Success Criteria

- [ ] PDF upload works end-to-end
- [ ] Parallel processing completes faster than sequential
- [ ] Duplicates detected and removed from stored PDF
- [ ] Chunks searchable via existing RAG
- [ ] No regression in chat citation quality
- [ ] BYOK integration works (user's key used)
- [ ] Error handling doesn't kill pipeline

## Related Specs

- [Migration Overview](./00-overview.md)
- [Chat Streaming](../chat-streaming.md) - RAG integration
- [OpenRouter BYOK](./02-openrouter-byok.md) - API key handling

## Open Questions

1. **Max file size?** - Currently unspecified, suggest 10-20MB limit
2. **Supported formats?** - PDF only for now, or allow PPTX?
3. **Rate limit handling?** - What if OpenRouter returns 429?
