# Citation/References Debugging

**Status:** Accepted
**Superseded by:** [source-saving-pipeline.md](./source-saving-pipeline.md) - see that spec for the full pipeline. This spec retained for debugging-specific guidance.

## Issue Summary

Citations (references like `[1]`, `[2]`) in AI responses sometimes fail to render as clickable links. Some messages have working citations while others don't.

## How Citations Work

### Data Flow

1. **During Streaming**
   - Backend sends `data-rag-source` events via SSE stream (`app/api/chat/route.ts` line 220-224)
   - `useChat.ts` captures these in `onData` callback → `streamingSources` state (line 141-147)
   - `MarkdownMessage` receives sources and renders `CitationLink` components (line 74-84)

2. **After Streaming Completes**
   - Backend `onFinish` saves message to DB, then calls `saveSourcesWithDedup()` (line 264-276)
   - `saveSourcesWithDedup()` upserts to `ai.course_sources` and inserts refs to `ai.message_source_refs`
   - Frontend `onFinish` callback saves `streamingSources` to `sourcesMap[message.id]` (line 149-168)
   - Sources are cleared from `streamingSources`

3. **Loading History**
   - `GET /api/sessions/[id]/messages` fetches messages with sources (line 32-38)
   - Backend uses `loadSourcesForSession()` to JOIN `message_source_refs` with `course_sources`
   - Sources stored in `sourcesMap` keyed by `message.id` (line 91-97)

### Citation Rendering (MarkdownMessage.tsx)

```tsx
// Citations [1] are preprocessed to [[1]](#cite-1) markdown links (line 37-41)
// Then rendered via custom `a` component:
const source = sources.find((s) => s.chunk_number === chunkNumber);
if (source) {
  return <CitationLink ... />;  // Clickable (line 76-83)
}
return <span>...</span>;  // Disabled/broken (line 85-95)
```

## Potential Failure Points

### 1. Sources Not Sent by Backend
- Backend `/api/chat` route may not emit `data-rag-source` events
- RAG pipeline may not return sources for certain queries
- **Check:** Network tab → look for `data-rag-source` events in SSE stream

### 2. Message ID Mismatch
- `message.id` at streaming time differs from DB-assigned message ID
- AI SDK may regenerate IDs causing sourcesMap lookup to fail
- **Current mitigation:** Backend uses `savedAssistantMsg.id` from database (line 253-260)

### 3. chunk_number Mismatch
- Backend sends sources with `chunk_number` values that don't match citation numbers
- Citations in text are [1], [2] but sources have different numbering
- **Check:** `searchKnowledge()` in `lib/ai/retrieval.ts` uses `startIndex` to offset numbering correctly

### 4. Race Condition in Frontend
- `setStreamingSources([])` in `sendMessage` could clear sources before `onFinish` saves them
- **Current mitigation:** `onFinish` uses closure over `currentSources` state (line 151), not a ref

### 5. History Loading Issues
- Backend `GET /api/sessions/[id]/messages` doesn't return sources
- `ai.course_sources` or `ai.message_source_refs` missing entries for that message
- **Check:** SQL query below

### 6. Backend onFinish Never Fired
- Stream interrupted before completion
- Client disconnected mid-stream
- **Current mitigation:** `consumeStream()` ensures backend `onFinish` fires (line 307)

### 7. Deduplication Insert Failed
- `onConflictDoNothing()` skipped insert, then re-fetch failed
- `message_source_refs` created with wrong `courseSourceId`
- **Check:** Console logs from `saveSourcesWithDedup()` (line 39, 266)

### 8. camelCase/snake_case Mismatch
- Backend returns camelCase, frontend `RAGSource` type uses snake_case
- **Check:** Transformation in `app/api/sessions/[id]/messages/route.ts` (line 49-61)

## Debugging Steps

1. **Check browser console** for errors when clicking broken citations

2. **Verify streaming sources**
   ```js
   // In useChat.ts onData callback (line 141), add:
   console.log('RAG source received:', dataPart);
   ```

3. **Verify frontend onFinish saves sources**
   ```js
   // In useChat.ts onFinish callback (line 149), add:
   console.log('Saving sources for message:', message.id, currentSources);
   ```

4. **Verify backend onFinish fires**
   ```js
   // Check Railway logs for:
   "[Chat] Saving N sources for message <id>"
   "[Chat] Sources saved successfully"
   ```

5. **Check database tables**
   ```sql
   -- Check if sources were persisted for a message
   SELECT r.*, cs.*
   FROM ai.message_source_refs r
   JOIN ai.course_sources cs ON r.course_source_id = cs.id
   WHERE r.message_id = '<broken-message-id>';

   -- Check all sources for a session
   SELECT r.message_id, r.chunk_number, cs.source_type, cs.title
   FROM ai.message_source_refs r
   JOIN ai.course_sources cs ON r.course_source_id = cs.id
   WHERE r.session_id = '<session-id>'
   ORDER BY r.message_id, r.chunk_number;

   -- Check for orphaned refs (missing course sources)
   SELECT r.*
   FROM ai.message_source_refs r
   LEFT JOIN ai.course_sources cs ON r.course_source_id = cs.id
   WHERE cs.id IS NULL;
   ```

6. **Verify API response includes sources**
   - Network tab → `/api/sessions/[id]/messages` → check response
   - Ensure `sources` field is present and contains expected `chunk_number` values

7. **Check SSE stream events**
   - Network tab → `/api/chat` → EventStream
   - Look for `data-rag-source` events with correct `chunk_number` sequence

## Key Files

| File | Role | Key Lines |
|------|------|-----------|
| `hooks/useChat.ts` | Source state management (`streamingSources`, `sourcesMap`) | 19-20, 141-168, 200-207 |
| `app/api/chat/route.ts` | Streams `data-rag-source` events, persists sources in `onFinish` | 100-101, 220-224, 264-276 |
| `lib/sources/deduplicated-sources.ts` | `saveSourcesWithDedup()`, `loadSourcesForSession()` | 29-127, 129-179 |
| `components/Chat/MarkdownMessage.tsx` | Citation preprocessing and rendering | 37-41, 69-96 |
| `components/Chat/CitationLink.tsx` | Clickable citation button component | 20-45 |
| `app/api/sessions/[id]/messages/route.ts` | History loading with source JOIN | 32-65 |
| `lib/db/schema.ts` | `courseSources`, `messageSourceRefs` table definitions | 102-156 |

## Database Schema

### `ai.course_sources` - Deduplicated source pool
- `id` (UUID PK), `courseId`, `sourceKey` (UNIQUE per course)
- `sourceType` ('slide' | 'lecture')
- Slide fields: `documentId`, `slideNumber`
- Lecture fields: `lectureId`, `startSeconds`, `endSeconds`
- Metadata: `contentPreview`, `title`

### `ai.message_source_refs` - Lightweight join table
- `id` (UUID PK), `messageId`, `sessionId`
- `courseSourceId` (FK to `course_sources`, CASCADE DELETE)
- `chunkNumber` - The citation number [1], [2], etc.

**Legacy table:** `ai.message_sources` still exists but is deprecated (not used by current code).

## Related Specs

- [source-saving-pipeline.md](./source-saving-pipeline.md) - Full source pipeline (authoritative)
- [lecture-citations.md](./lecture-citations.md) - Lecture citation click handling
- [chat-streaming.md](./chat-streaming.md) - AI SDK streaming integration
- [markdown-rendering.md](./markdown-rendering.md) - Citation rendering in markdown
