# Message Sources Persistence

**Status:** Implemented (Historical)
**Superseded by:** [source-saving-pipeline.md](./source-saving-pipeline.md) — see that spec for the full pipeline. This spec retained for historical context on the persistence design.

## Overview

Persist RAG sources in a two-table deduplication strategy (`ai.course_sources` + `ai.message_source_refs`) so citations work when loading message history (page refresh, session switch).

## Problem

RAG sources are streamed via SSE during chat but must be persisted for citations to work when users:
- Refresh the page
- Switch to another session and back
- Load chat history

Without persistence, citation references `[1]`, `[2]` become non-functional because sources are lost.

## Solution

Store sources using a two-table deduplication strategy:
1. **`ai.course_sources`** — Deduplicated pool of unique sources per course
2. **`ai.message_source_refs`** — Lightweight join table linking messages to course sources

This prevents duplicate storage when multiple messages reference the same slide or lecture timestamp.

---

## Database Schema

### Table: `ai.course_sources`

Deduplicated source pool shared across all messages in a course.

```sql
CREATE TABLE ai.course_sources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL,
    source_key TEXT NOT NULL,                 -- Unique identifier: "doc_{id}_slide_{n}" or "lec_{id}_{start}_{end}"
    source_type TEXT NOT NULL,                -- 'slide' | 'lecture'
    document_id UUID,                         -- For slides
    slide_number INT,                         -- For slides
    lecture_id UUID,                          -- For lectures
    start_seconds FLOAT,                      -- For lectures
    end_seconds FLOAT,                        -- For lectures
    content_preview TEXT,
    title TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT idx_course_sources_unique UNIQUE (course_id, source_key)
);

CREATE INDEX idx_course_sources_course_id ON ai.course_sources(course_id);
```

**Design decisions:**
- `source_key` is a deterministic unique identifier generated from source fields
- `UNIQUE(course_id, source_key)` prevents duplicates within a course
- No FK constraints to chat messages (they're in separate tables)

### Table: `ai.message_source_refs`

Lightweight join table linking messages to deduplicated sources.

```sql
CREATE TABLE ai.message_source_refs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id TEXT NOT NULL,                 -- UUID stored as TEXT (matches AI SDK format)
    session_id UUID NOT NULL,                 -- Denormalized for efficient session-level loads
    course_source_id UUID NOT NULL REFERENCES ai.course_sources(id) ON DELETE CASCADE,
    chunk_number INT NOT NULL,                -- Citation number [1], [2], etc.
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_message_source_refs_message_id ON ai.message_source_refs(message_id);
CREATE INDEX idx_message_source_refs_session_id ON ai.message_source_refs(session_id);
CREATE INDEX idx_message_source_refs_course_source_id ON ai.message_source_refs(course_source_id);
```

**Design decisions:**
- `message_id` is TEXT (AI SDK generates string UUIDs)
- `session_id` denormalized for efficient bulk loads
- CASCADE DELETE ensures orphaned refs are cleaned up when course sources are deleted

---

## Implementation

### 1. Migration

**File:** `drizzle/migrations/0007_known_madripoor.sql`

Creates both `course_sources` and `message_source_refs` tables with indexes and constraints.

### 2. Drizzle ORM Schema

**File:** `lib/db/schema.ts` (lines 102-156)

```typescript
export const courseSources = aiSchema.table(
  'course_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').notNull(),
    sourceKey: text('source_key').notNull(),
    sourceType: text('source_type').notNull(),
    documentId: uuid('document_id'),
    slideNumber: integer('slide_number'),
    lectureId: uuid('lecture_id'),
    startSeconds: real('start_seconds'),
    endSeconds: real('end_seconds'),
    contentPreview: text('content_preview'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_course_sources_course_id').on(table.courseId),
    uniqueIndex('idx_course_sources_unique').on(table.courseId, table.sourceKey),
  ]
);

export const messageSourceRefs = aiSchema.table(
  'message_source_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    sessionId: uuid('session_id').notNull(),
    courseSourceId: uuid('course_source_id')
      .notNull()
      .references(() => courseSources.id, { onDelete: 'cascade' }),
    chunkNumber: integer('chunk_number').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_message_source_refs_message_id').on(table.messageId),
    index('idx_message_source_refs_session_id').on(table.sessionId),
    index('idx_message_source_refs_course_source_id').on(table.courseSourceId),
  ]
);
```

### 3. Deduplication Service

**File:** `lib/sources/deduplicated-sources.ts`

#### Source Key Generation

```typescript
function generateSourceKey(source: RAGSource): string {
  if (source.source_type === 'slide' && source.document_id && source.slide_number) {
    return `doc_${source.document_id}_slide_${source.slide_number}`;
  }
  if (source.source_type === 'lecture' && source.lecture_id) {
    const start = Math.floor(source.start_seconds ?? 0);
    const end = Math.floor(source.end_seconds ?? 0);
    return `lec_${source.lecture_id}_${start}_${end}`;
  }
  return source.source_id;
}
```

#### Save Sources

```typescript
export async function saveSourcesWithDedup(
  sources: RAGSource[],
  messageId: string,
  sessionId: string,
  courseId: string
): Promise<void>
```

**Algorithm:**
1. Generate unique keys for all sources
2. Query existing `course_sources` for these keys
3. Insert new sources with `onConflictDoNothing()` (deduplication)
4. Re-fetch any sources that were skipped by conflict resolution
5. Create lightweight refs in `message_source_refs` linking message to course sources

#### Load Sources

```typescript
export async function loadSourcesForSession(
  sessionId: string
): Promise<Record<string, RAGSource[]>>
```

**Algorithm:**
1. JOIN `message_source_refs` with `course_sources` WHERE `session_id`
2. Group results by `message_id`
3. Return map of `messageId` → `RAGSource[]`

### 4. Chat Route - Persist Sources

**File:** `app/api/chat/route.ts` (lines 232-277)

Sources are collected during tool execution and persisted in the `onFinish` callback:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      // ... model config ...
      tools: {
        search_course_materials: tool({
          execute: async ({ query }) => {
            const { context, sources } = await searchKnowledge({
              query,
              userId,
              courseId,
              documentId,
              lectureId,
              apiKey,
              startIndex: collectedSources.length,
            });
            collectedSources.push(...sources);

            // Stream sources to frontend immediately
            for (const source of sources) {
              writer.write({
                type: 'data-rag-source',
                data: source,
              });
            }

            return context;
          },
        }),
      },
      onFinish: async ({ response }) => {
        // Extract assistant content
        const assistantContent = response.messages
          .filter((m) => m.role === 'assistant')
          .map((m) => /* extract text */)
          .join('');

        // Save assistant message to database
        const [savedAssistantMsg] = await db
          .insert(chatMessages)
          .values({
            sessionId,
            role: 'assistant',
            content: assistantContent,
          })
          .returning();

        // Save sources with deduplication
        if (collectedSources.length > 0 && savedAssistantMsg) {
          await saveSourcesWithDedup(
            collectedSources,
            savedAssistantMsg.id,  // Use DB-assigned message ID
            sessionId,
            courseId
          );
        }
      },
    });

    // consumeStream() ensures onFinish fires even if client disconnects
    result.consumeStream();
    writer.merge(result.toUIMessageStream());
  },
});
```

**Key insight:** `consumeStream()` guarantees `onFinish` executes server-side even if the frontend disconnects, ensuring sources are always persisted.

### 5. Message Retrieval - Load Sources

**File:** `app/api/sessions/[id]/messages/route.ts` (lines 32-64)

```typescript
export async function GET(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  const { id: sessionId } = await params;

  // Verify session ownership
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId)
    ),
  });

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Get all messages
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
  });

  // Load sources from deduplicated tables
  const sourcesByMessageId = await loadSourcesForSession(sessionId);

  return Response.json({
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      // Transform snake_case to camelCase for API response
      sources: msg.role === 'assistant'
        ? (sourcesByMessageId[String(msg.id)] || []).map((src) => ({
            sourceId: src.source_id,
            sourceType: src.source_type,
            chunkNumber: src.chunk_number,
            contentPreview: src.content_preview,
            documentId: src.document_id,
            slideNumber: src.slide_number,
            lectureId: src.lecture_id,
            startSeconds: src.start_seconds,
            endSeconds: src.end_seconds,
            courseId: src.course_id,
            title: src.title,
          }))
        : undefined,
    })),
  });
}
```

**Note:** API response uses camelCase, but internal `RAGSource` type uses snake_case.

### 6. Session Delete - Cleanup Sources

When deleting a session, message sources are automatically cleaned up via CASCADE DELETE on the `course_source_id` foreign key. If a `course_source` becomes orphaned (no refs pointing to it), it remains in the pool for potential reuse by future messages.

---

## Frontend Integration

### Type Definition

**File:** `types/index.ts` (lines 1-14)

```typescript
export type RAGSource = {
  source_id: string;
  source_type: "slide" | "lecture";
  content_preview: string;
  chunk_number: number;
  document_id?: string;
  slide_number?: number;
  lecture_id?: string;
  start_seconds?: number;
  end_seconds?: number;
  course_id?: string;
  title?: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: RAGSource[];
};
```

### Chat Hook

**File:** `hooks/useChat.ts`

Manages sources through three states:
1. **`streamingSources`** — Collects sources during active streaming
2. **`sourcesMap`** — Maps message IDs to their persisted sources
3. **`initialMessages`** — Loaded from API with sources attached

```typescript
export const useChat = (courseId: string, sessionId: string) => {
  const [streamingSources, setStreamingSources] = useState<RAGSource[]>([]);
  const [sourcesMap, setSourcesMap] = useState<Record<string, RAGSource[]>>({});

  const { messages: aiMessages, ... } = useAIChat({
    onData: (dataPart) => {
      // Capture RAG sources from SSE events
      if (dataPart.type === "data-rag-source") {
        const sourceData = (dataPart as { data: RAGSource }).data;
        setStreamingSources((prev) => [...prev, sourceData]);
      }
    },
    onFinish: ({ message }) => {
      // Move streaming sources to persistent map
      setStreamingSources((currentSources) => {
        if (currentSources.length > 0) {
          setSourcesMap((prev) => ({
            ...prev,
            [message.id]: currentSources,
          }));
        }
        return [];
      });
    },
  });

  // Load history with sources
  useEffect(() => {
    if (!sessionId) return;

    const loadMessages = async () => {
      const messages = await api.sessions.getMessages(token, sessionId);

      // Build sources map from API response
      const loadedSourcesMap: Record<string, RAGSource[]> = {};
      for (const msg of messages) {
        if (msg.sources && msg.sources.length > 0) {
          loadedSourcesMap[msg.id] = msg.sources;
        }
      }
      setSourcesMap(loadedSourcesMap);
      setInitialMessages(/* convert to UIMessage */);
    };

    loadMessages();
  }, [sessionId]);

  // Merge sources into messages
  const messages: ChatMessage[] = aiMessages.map((msg, index) => {
    const isLastAssistantMessage = msg.role === "assistant" && index === aiMessages.length - 1;
    const isCurrentlyStreaming = status === "streaming" && isLastAssistantMessage;

    let messageSources: RAGSource[] | undefined;
    if (msg.role === "assistant") {
      if (isCurrentlyStreaming) {
        messageSources = streamingSources.length > 0 ? streamingSources : undefined;
      } else {
        messageSources = sourcesMap[msg.id];
      }
    }

    return {
      id: msg.id,
      role: msg.role,
      content: /* extract text */,
      sources: messageSources,
    };
  });
};
```

---

## Files Modified

| File | Change |
|------|--------|
| `drizzle/migrations/0007_known_madripoor.sql` | New migration creating deduplicated tables |
| `lib/db/schema.ts` | Add `courseSources`, `messageSourceRefs` Drizzle schemas |
| `lib/sources/deduplicated-sources.ts` | New service (`saveSourcesWithDedup`, `loadSourcesForSession`) |
| `app/api/chat/route.ts` | Collect sources during tool execution, persist in `onFinish` |
| `app/api/sessions/[id]/messages/route.ts` | Load sources via `loadSourcesForSession`, transform to camelCase |
| `hooks/useChat.ts` | Add `streamingSources`, `sourcesMap`, load sources from API |
| `types/index.ts` | Define `RAGSource` type (snake_case fields) |

---

## Related Specs

- [source-saving-pipeline.md](./source-saving-pipeline.md) — Full end-to-end pipeline (streaming, persistence, loading)
- [chat-streaming.md](./chat-streaming.md) — AI SDK streaming integration
- [rag-system.md](./rag-system.md) — RAG retrieval and context formatting
