# Source Saving Pipeline

**Status:** Accepted
**Supersedes:** [message-sources-persistence.md](./message-sources-persistence.md), [citation-debugging.md](./citation-debugging.md)

## Overview

Sources (RAG citations) flow through three phases: **streaming**, **persistence**, and **history loading**. The pipeline uses a two-table deduplication strategy with `ai.course_sources` and `ai.message_source_refs`.

---

## What Are Sources?

Sources are references to the original document chunks the AI used to answer a question. Two types:

- **Slide sources** — reference a specific slide in a PDF (e.g., "Lecture 5 - Slide 12")
- **Lecture sources** — reference a timestamp range in a transcript (e.g., "Week 3 @ 12:34")

**Type definition** (`types/index.ts`):
```typescript
export type RAGSource = {
  source_id: string;
  source_type: "slide" | "lecture";
  content_preview: string;
  chunk_number: number;        // Citation number [1], [2], etc.
  document_id?: string;         // For slides
  slide_number?: number;        // For slides
  lecture_id?: string;          // For lectures
  start_seconds?: number;       // For lectures
  end_seconds?: number;         // For lectures
  course_id?: string;
  title?: string;
};
```

---

## End-to-End Flow

```
STREAMING PHASE
  User sends message
  → Backend RAG tool (search_course_materials) executes
  → writer.write({ type: 'data-rag-source', data: source })  [per source]
  → Frontend useChat.onData() → setStreamingSources([...prev, source])
  → MarkdownMessage renders citations inline during streaming

COMPLETION PHASE (persistence)
  Backend onFinish() fires (app/api/chat/route.ts)
  → Save message to ai.chat_messages → get DB-assigned message ID
  → saveSourcesWithDedup(collectedSources, messageId, sessionId, courseId)
      1. Generate unique keys per source
      2. Upsert to ai.course_sources (deduped by courseId + sourceKey)
      3. Insert refs to ai.message_source_refs (messageId → courseSourceId)
  → Frontend useChat.onFinish() fires
  → sourcesMap[message.id] = streamingSources
  → setStreamingSources([])

HISTORY LOADING
  Session loads or switches
  → GET /api/sessions/[id]/messages
  → Backend: loadSourcesForSession(sessionId)
      JOIN message_source_refs → course_sources, grouped by messageId
  → Frontend receives camelCase response
  → setSourcesMap from response.sources
  → Messages render with loaded sources
```

---

## Database Schema

### `ai.course_sources` — Deduplicated source pool

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `courseId` | UUID NOT NULL | FK to course |
| `sourceKey` | TEXT NOT NULL | Unique key (see below) |
| `sourceType` | TEXT NOT NULL | `"slide"` or `"lecture"` |
| `documentId` | UUID | For slides |
| `slideNumber` | INT | For slides |
| `lectureId` | UUID | For lectures |
| `startSeconds` | FLOAT | For lectures |
| `endSeconds` | FLOAT | For lectures |
| `contentPreview` | TEXT | Chunk text preview |
| `title` | TEXT | Document/lecture title |

**Constraint:** `UNIQUE(courseId, sourceKey)` — prevents duplicate sources per course.

**Source key format** (`lib/sources/deduplicated-sources.ts`):
```
Slide:   "doc_{documentId}_slide_{slideNumber}"
Lecture: "lec_{lectureId}_{startSeconds}_{endSeconds}"
```

### `ai.message_source_refs` — Lightweight join table

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID PK | Auto-generated |
| `messageId` | TEXT NOT NULL | Links to chat message |
| `sessionId` | TEXT NOT NULL | Denormalized for efficient session-level loads |
| `courseSourceId` | UUID NOT NULL | FK to `course_sources` (CASCADE DELETE) |
| `chunkNumber` | INT NOT NULL | Citation number [1], [2], etc. |

**Index:** on `messageId` for fast lookups.

---

## Key Files

| File | Role |
|------|------|
| `hooks/useChat.ts` | Frontend state: `streamingSources`, `sourcesMap`, `onData`, `onFinish` |
| `app/api/chat/route.ts` | Streams `data-rag-source` events, persists sources in `onFinish` |
| `lib/sources/deduplicated-sources.ts` | `saveSourcesWithDedup()`, `loadSourcesForSession()` |
| `lib/ai/retrieval.ts` | RAG search + `formatRetrievalContext()` (generates numbered citations) |
| `app/api/sessions/[id]/messages/route.ts` | History loading: joins sources into message response |
| `lib/db/schema.ts` | Drizzle ORM definitions for `courseSources`, `messageSourceRefs` |
| `components/Chat/MarkdownMessage.tsx` | Preprocesses `[1]` → `[[1]](#cite-1)`, renders `CitationLink` |
| `components/Chat/CitationLink.tsx` | Clickable citation button component |
| `components/StudyBuddyClient.tsx` | `handleCitationClick` — routes to slides panel or video player |

---

## Known Fragility Points

### 1. `onFinish` Not Firing
**Cause:** Stream interruption, client disconnect, backend crash after streaming.
**Impact:** Sources never persisted to DB. Citations work during session but break on reload.
**Current mitigation:** `consumeStream()` ensures backend-side `onFinish` fires even if frontend disconnects.

### 2. Message ID Mismatch
**Cause:** Frontend streaming message ID differs from DB-assigned message ID.
**Impact:** `sourcesMap` lookup fails — sources exist in DB but aren't matched to the message.
**Current mitigation:** Uses `savedAssistantMsg.id` (Agno's native ID) when calling `saveSourcesWithDedup`.

### 3. `collectedSources` Empty at Save Time
**Cause:** Race condition — sources collected via closure may be empty if `onFinish` fires before all `data-rag-source` events are processed.
**Impact:** Nothing to save; message persisted without sources.

### 4. Dedup Insert Silently Fails
**Cause:** `onConflictDoNothing()` skips insert for existing keys, then re-fetch query fails or returns wrong IDs.
**Impact:** `message_source_refs` created with missing/wrong `courseSourceId`.

### 5. Rapid Message Sending
**Cause:** `setStreamingSources([])` in `sendMessage` clears state before previous `onFinish` fires.
**Impact:** Previous message's streaming sources wiped before they're moved to `sourcesMap`.
**Current mitigation:** `onFinish` uses closure over collected sources, not a ref to `streamingSources` state.

### 6. Multiple Tool Calls in One Response
**Cause:** RAG tool called multiple times → `searchKnowledge` offsets `chunk_number` by `startIndex`.
**Impact:** If offset logic is wrong, citation `[3]` in text maps to source with `chunk_number=1`.

### 7. History Loading — camelCase/snake_case Mismatch
**Cause:** Backend returns camelCase, frontend `RAGSource` type uses snake_case.
**Impact:** Field mapping in `lib/api.ts` must convert correctly or source fields are undefined.
**Location:** `lib/api.ts` lines ~330-342.

---

## Testing Checklist

### What Should Trigger Source Saving
- [ ] Send a message that hits the RAG tool (question about course materials)
- [ ] Multiple RAG calls in one response (follow-up clarification)
- [ ] Slide-only sources, lecture-only sources, mixed sources
- [ ] Sources with duplicate keys across messages (dedup path)

### What Should Survive
- [ ] Page refresh — sources reload from DB
- [ ] Session switch and switch back — sources still present
- [ ] Citation click after reload — navigates to correct slide/timestamp

### What Might Break
- [ ] Send message, immediately close tab before stream finishes
- [ ] Send two messages rapidly (before first finishes)
- [ ] Query that returns 0 RAG results (no sources to save)
- [ ] Very long response with 10+ citations
- [ ] Network interruption mid-stream

### Debugging Steps
1. **Browser console:** Look for errors in `onData` / `onFinish` callbacks
2. **Network tab:** Check SSE stream for `data-rag-source` events
3. **Network tab:** Check `/api/sessions/[id]/messages` response for `sources` field
4. **DB query:**
   ```sql
   -- Check if sources were persisted for a message
   SELECT r.*, cs.*
   FROM ai.message_source_refs r
   JOIN ai.course_sources cs ON r.course_source_id = cs.id
   WHERE r.message_id = '<message-id>';

   -- Check all sources for a session
   SELECT r.message_id, r.chunk_number, cs.source_type, cs.title
   FROM ai.message_source_refs r
   JOIN ai.course_sources cs ON r.course_source_id = cs.id
   WHERE r.session_id = '<session-id>'
   ORDER BY r.message_id, r.chunk_number;
   ```

---

## Related Specs

- [chat-streaming.md](./chat-streaming.md) — AI SDK streaming integration
- [lecture-citations.md](./lecture-citations.md) — Lecture citation click handling
- [markdown-rendering.md](./markdown-rendering.md) — Citation rendering in markdown
- [resilient-chat-requests.md](./resilient-chat-requests.md) — Background jobs, disconnect handling
