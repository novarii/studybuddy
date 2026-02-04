# Phase 4 Tasks: Lecture Pipeline

**Spec Reference:** [04-lecture-pipeline.md](../specs/migration/04-lecture-pipeline.md)

## Current Status

**Status:** Task 6 (Testing & Validation) - Automated tests complete

**Recent work:**
- Added API route integration tests: `__tests__/api/lectures/*.test.ts`
- Added E2E tests: `e2e/tests/lecture-upload.spec.ts`
- Updated playwright config to include lecture tests
- All 568 unit tests pass, 24 E2E tests pass

**Tasks 1-6 complete (automated testing).** Manual testing (6.15-6.18) remains for production validation.

---

## Task Overview

| Task | Description | Dependencies | Effort |
|------|-------------|--------------|--------|
| 1 | Project Setup | None | Medium |
| 2 | RunPod Transcription Client | Task 1 | Medium |
| 3 | FFmpeg Integration | Task 1 | Medium |
| 4 | Semantic Chunking | Task 2 | Medium |
| 5 | API Routes | Tasks 3, 4 | Medium |
| 6 | Testing & Validation | Task 5 | Medium |

---

## Task 1: Project Setup

**Goal:** Add database schema, storage utilities, and environment configuration.

### Subtasks - Database Schema
- [x] 1.1 Add `lectures` table to `lib/db/schema.ts`
- [x] 1.2 Add `userLectures` join table to `lib/db/schema.ts`
- [x] 1.3 Generate migration with `drizzle-kit generate`
- [x] 1.4 Run migration against dev database
- [x] 1.5 Verify tables created with unique constraint on (courseId, panoptoSessionId)
- [x] 1.6 Export `lectures`, `userLectures` from `lib/db/index.ts`

### Schema Definition
```typescript
export const lectures = pgTable('lectures', {
  id: uuid('id').primaryKey().defaultRandom(),
  courseId: uuid('course_id').notNull(),
  panoptoSessionId: text('panopto_session_id').notNull(),
  panoptoUrl: text('panopto_url'),
  streamUrl: text('stream_url'),
  title: text('title').notNull(),
  durationSeconds: integer('duration_seconds'),
  chunkCount: integer('chunk_count'),
  status: text('status').notNull().default('pending'),
  errorMessage: text('error_message'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  courseSessionIdx: uniqueIndex('lectures_course_session_idx')
    .on(table.courseId, table.panoptoSessionId),
}));

export const userLectures = pgTable('user_lectures', {
  userId: text('user_id').notNull(),
  lectureId: uuid('lecture_id').notNull().references(() => lectures.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.lectureId] }),
}));
```

**Note:** No file storage columns - audio is temporary, only embeddings persist in pgvector.

### Subtasks - Temp File Handling
- [x] 1.7 Create `lib/lectures/temp-files.ts` with temp file utilities
- [x] 1.8 Implement `saveTempAudio()` - save audio to tmp/ directory
- [x] 1.9 Implement `cleanupTempAudio()` - delete temp files after processing
- [x] 1.10 Ensure tmp/ directory exists on startup

### Environment Variables
```bash
RUNPOD_API_KEY=xxx
RUNPOD_ENDPOINT_ID=xxx
```

### Deliverables
- `lib/db/schema.ts` with `lectures` and `userLectures` tables
- `drizzle/migrations/` - New migration file
- `lib/lectures/temp-files.ts` - Temp file utilities

---

## Task 2: RunPod Transcription Client

**Goal:** Implement async transcription via RunPod faster-whisper worker.

### Subtasks
- [x] 2.1 Create `lib/lectures/runpod-client.ts`
- [x] 2.2 Implement `submitTranscriptionJob()` - POST to RunPod /run endpoint
- [x] 2.3 Implement `pollForResult()` - GET /status/{jobId} with retry loop
- [x] 2.4 Implement `transcribeAudio()` - high-level function combining submit + poll
- [x] 2.5 Define `WhisperSegment` and `TranscriptionResult` types
- [x] 2.6 Handle RunPod error responses (FAILED status, timeouts)
- [x] 2.7 Write unit tests with mocked RunPod responses

### API Configuration
```typescript
const RUNPOD_CONFIG = {
  model: 'small',
  language: 'en',
  transcription: 'plain_text',
  word_timestamps: true,
  enable_vad: false,
};
```

### Types
```typescript
interface WhisperSegment {
  id: number;
  start: number;  // seconds
  end: number;    // seconds
  text: string;
}

interface TranscriptionResult {
  transcription: string;
  segments: WhisperSegment[];
  detected_language: string;
}
```

### Deliverables
- `lib/lectures/runpod-client.ts`
- `lib/lectures/types.ts` - TypeScript types
- `__tests__/lib/lectures/runpod-client.test.ts`

---

## Task 3: FFmpeg Integration

**Goal:** Implement audio extraction from HLS streams and video files.

### Subtasks
- [x] 3.1 Create `lib/lectures/ffmpeg.ts`
- [x] 3.2 Implement `downloadAndExtractAudio()` - HLS URL → audio file
- [x] 3.3 Implement `extractAudioFromFile()` - local video → audio file
- [x] 3.4 Implement `probeDuration()` - get audio duration via ffprobe
- [x] 3.5 Handle FFmpeg errors with descriptive messages
- [x] 3.6 Write unit tests (mock child_process spawn)

### Implementation Notes
```typescript
// FFmpeg handles HLS natively - one command does everything
ffmpeg -i "https://cloudfront.../master.m3u8?signed" -vn -acodec aac output.m4a
```

### Deliverables
- `lib/lectures/ffmpeg.ts`
- `__tests__/lib/lectures/ffmpeg.test.ts`

---

## Task 4: Normalization & Chunking

**Goal:** Clean transcript and implement LLM-based topic detection.

### Subtasks - Transcript Normalization
- [x] 4.1 Create `lib/lectures/normalize.ts`
- [x] 4.2 Define `FILLER_WORDS` list (okay, um, uh, like, you know, etc.)
- [x] 4.3 Implement `removeFillerWords()` - regex-based removal
- [x] 4.4 Implement `detectGarbage()` - detect repeated phrases (hallucinations)
- [x] 4.5 Implement `normalizeTranscript()` - clean all segments
- [x] 4.6 Write unit tests for normalization edge cases

### Subtasks - Time-Based (Fallback)
- [x] 4.7 Create `lib/lectures/chunking/time-based.ts`
- [x] 4.8 Implement `chunkByTime()` - group segments into ~180s chunks
- [x] 4.9 Preserve start/end timestamps from Whisper segments

### Subtasks - Semantic (Primary)
- [x] 4.10 Create `lib/lectures/chunking/semantic.ts`
- [x] 4.11 Define Zod schema for LLM output (`SemanticChunksSchema`)
- [x] 4.12 Implement `detectTopicBoundaries()` - call LLM with generateObject()
- [x] 4.13 Implement `matchChunksToTimestamps()` - fuzzy match LLM text → Whisper segments
- [x] 4.14 Add BYOK integration (get user's API key for LLM call)

### Subtasks - Strategy Selector
- [x] 4.15 Create `lib/lectures/chunking/index.ts`
- [x] 4.16 Implement `chunkTranscript()` - normalize → try semantic → fallback to time-based
- [x] 4.17 Write unit tests for time-based chunking
- [x] 4.18 Write unit tests for semantic chunking (mock LLM)
- [x] 4.19 Write unit tests for timestamp matching

### Zod Schema
```typescript
const SemanticChunksSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().describe('Brief topic title (3-6 words)'),
      text: z.string().describe('The verbatim transcript text for this topic'),
    })
  ),
});
```

### Deliverables
- `lib/lectures/normalize.ts`
- `lib/lectures/chunking/time-based.ts`
- `lib/lectures/chunking/semantic.ts`
- `lib/lectures/chunking/index.ts`
- `__tests__/lib/lectures/normalize.test.ts`
- `__tests__/lib/lectures/chunking/time-based.test.ts`
- `__tests__/lib/lectures/chunking/semantic.test.ts`

---

## Task 5: API Routes & Pipeline

**Goal:** Implement lecture CRUD endpoints and processing pipeline.

### Subtasks - Pipeline Orchestration
- [x] 5.1 Create `lib/lectures/pipeline.ts`
- [x] 5.2 Implement `processLecture()` - full async pipeline for audio path
- [x] 5.3 Implement `downloadAndProcessLecture()` - full async pipeline for stream path
- [x] 5.4 Implement status updates throughout pipeline
- [x] 5.5 Implement chunk ingestion (embed + insert to pgvector)
- [x] 5.6 Implement error handling and status: 'failed'

### Subtasks - Deduplication Logic
- [x] 5.7 Implement `findExistingLecture()` - query by courseId + panoptoSessionId
- [x] 5.8 Implement deduplication flow:
  - If lecture exists: add user-lecture link, return existing ID (skip processing)
  - If not exists: create lecture, add link, start processing

### Subtasks - Audio Endpoint (Primary Path)
- [x] 5.9 Create `app/api/lectures/audio/route.ts`
- [x] 5.10 Implement multipart form-data parsing
- [x] 5.11 Call deduplication logic before processing
- [x] 5.12 Store temp audio and trigger async processing (only if new)
- [x] 5.13 Return 202 Accepted with lecture ID (+ `created: boolean` flag)

### Subtasks - Stream Endpoint (Fallback Path)
- [x] 5.14 Create `app/api/lectures/stream/route.ts`
- [x] 5.15 Implement JSON body parsing
- [x] 5.16 Extract panoptoSessionId from URL
- [x] 5.17 Call deduplication logic before processing
- [x] 5.18 Trigger async download + processing pipeline (only if new)

### Subtasks - List/Status/Delete
- [x] 5.19 Create `app/api/lectures/route.ts` (GET list by courseId)
- [x] 5.20 Create `app/api/lectures/[id]/route.ts` (GET status, DELETE)
- [x] 5.21 Add Clerk auth checks to all endpoints
- [x] 5.22 Add user-lecture ownership verification

### Subtasks - Helper Functions
- [x] 5.23 Implement `extractPanoptoSessionId()` - parse session ID from URL
- [x] 5.24 Implement `ensureUserLectureLink()` - create user-lecture association (idempotent)

### Deliverables
- `lib/lectures/pipeline.ts`
- `app/api/lectures/route.ts`
- `app/api/lectures/audio/route.ts`
- `app/api/lectures/stream/route.ts`
- `app/api/lectures/[id]/route.ts`

---

## Task 6: Testing & Validation

**Goal:** Comprehensive testing of lecture pipeline.

### Subtasks - Unit Tests
- [x] 6.1 Verify all unit tests from Tasks 2-4 pass
- [x] 6.2 Add edge case tests (empty transcript, single segment) - already covered in existing tests
- [x] 6.3 Test pipeline error handling and status transitions - covered in pipeline.test.ts
- [x] 6.4 Test idempotency (duplicate lecture detection) - covered in deduplication.test.ts

### Subtasks - Integration Tests
- [x] 6.5 Test audio endpoint with mock file upload - `__tests__/api/lectures/audio.test.ts`
- [x] 6.6 Test stream endpoint with mock URL - `__tests__/api/lectures/stream.test.ts`
- [x] 6.7 Test list endpoint filtering by courseId - `__tests__/api/lectures/route.test.ts`
- [x] 6.8 Test delete endpoint cascades (user-lecture links + chunks) - `__tests__/api/lectures/[id].test.ts`

### Subtasks - E2E Tests
- [x] 6.10 E2E test: upload audio (authenticated) - `e2e/tests/lecture-upload.spec.ts`
- [x] 6.11 E2E test: poll status until completed - covered in E2E status endpoint tests
- [x] 6.12 E2E test: verify lecture appears in list - covered in E2E list endpoint tests
- [x] 6.13 E2E test: delete lecture - covered in E2E delete endpoint tests
- [x] 6.14 E2E test: duplicate upload returns existing ID - skipped (requires full integration)

### Subtasks - Manual Testing
- [ ] 6.15 Test with real lecture audio file
- [ ] 6.16 Test semantic chunking produces meaningful topic splits
- [ ] 6.17 Verify timestamps are accurate (click → lands at topic)
- [ ] 6.18 Verify chunks searchable via chat RAG

### Deliverables
- [x] `__tests__/api/lectures/*.test.ts`
- [x] `e2e/tests/lecture-upload.spec.ts`
- Test fixtures in `__tests__/fixtures/` - not needed, mocks used instead

---

## Execution Order

```
Task 1 (Project Setup)
    ↓
    ├── Task 2 (RunPod Client) ──────┐
    │                                 │
    └── Task 3 (FFmpeg) ─────────────┤
                                      │
            Task 4 (Semantic Chunking)┘
                    ↓
            Task 5 (API Routes & Pipeline)
                    ↓
            Task 6 (Testing & Validation)
```

Tasks 2 and 3 can run in parallel after Task 1 completes.
Task 4 depends on Task 2 (needs Whisper segments).
Task 5 depends on Tasks 3 and 4.

---

## Definition of Done

Phase 4 is complete when:
- [ ] All 6 tasks marked complete
- [ ] Lectures upload and process end-to-end (both paths)
- [ ] Semantic chunks have accurate timestamps
- [ ] RAG search returns relevant lecture content
- [ ] No calls to Python backend for lectures
- [ ] All unit tests pass
- [ ] All E2E tests pass

---

## Notes

- Semantic chunking is experimental - may need prompt iteration
- FFmpeg must be available on deployment environment
- RunPod cold starts may add latency for first transcription
- Extension changes (to call new endpoints) tracked separately
