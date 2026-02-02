# Phase 1: Chat + RAG Migration

**Status:** Draft

## Overview

Migrate the chat and RAG system from Python/Agno to Next.js API routes with Vercel AI SDK. This is the foundational phase that proves the pattern before migrating other services.

**Goal:** Chat works end-to-end with AI SDK, sessions persist, citations display correctly.

## Current State (Python Backend)

### Chat Agent
- **Location:** `app/agents/chat_agent.py`
- **Framework:** Agno with PostgresDb session persistence
- **Model:** OpenRouter (Claude/GPT) or Google Gemini 2.5-pro fallback
- **Session Storage:** `ai.agno_sessions` table (Agno-managed, JSONB structure)

### RAG Retrieval
- **Knowledge Tables:** `ai.slide_chunks_knowledge`, `ai.lecture_chunks_knowledge` (pgvector)
- **Embeddings:** Voyage AI `voyage-3-lite` (512 dimensions) - **will be replaced**
- **Search Strategy:** Slides first (5 results, per-user), then lectures (5 results, per-course)
- **Metadata Filtering:** owner_id, course_id, document_id, lecture_id

> **Note:** Existing knowledge tables use 512-dim vectors. Migration will recreate with 1536-dim for OpenRouter/OpenAI embeddings. Test data only - no migration concern.

### Message Sources
- **Table:** `ai.message_sources` (custom, not Agno-managed)
- **Purpose:** Persist RAG citations so they survive page refresh
- **Key Fields:** message_id, session_id, source_id, chunk_number, document_id/lecture_id, timestamps

### API Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/agent/chat` | POST | Streaming chat (SSE) |
| `/api/sessions` | GET | List sessions (paginated) |
| `/api/sessions` | POST | Create session |
| `/api/sessions/{id}/messages` | GET | Load message history |
| `/api/sessions/{id}/generate-title` | POST | Auto-generate title |
| `/api/sessions/{id}` | DELETE | Delete session |

### Streaming Format
- Vercel AI SDK v5 SSE format via custom `AgnoVercelAdapter`
- Custom `data-rag-source` events for citations
- Header: `x-vercel-ai-ui-message-stream: v1`

## Current State (Next.js Frontend)

### Chat Implementation
- **Hook:** `useChat.ts` using `@ai-sdk/react` v3.0.69 with `useAIChat`
- **Transport:** `DefaultChatTransport` from `ai` package
- **API Endpoint:** `{NEXT_PUBLIC_API_URL}/agent/chat`

### Session Management
- **Hook:** `useChatSessions.ts`
- **New Session Tracking:** `newSessionIds` ref prevents loading empty history

### Citation Handling
- **Capture:** `onData` callback catches `data-rag-source` events
- **Storage:** `sourcesMap` keyed by message ID
- **Display:** `CitationLink` component with click-to-navigate

### Types
```typescript
type RAGSource = {
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

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isStreaming?: boolean;
  sources?: RAGSource[];
};

type ChatSession = {
  session_id: string;
  session_name: string | null;
  course_id: string | null;
  created_at: string;
  updated_at: string;
};
```

## Target State (Next.js Full-Stack)

### New Database Schema

Replace `ai.agno_sessions` with explicit tables we control:

```sql
-- New tables in 'ai' schema (alongside existing knowledge tables)

CREATE TABLE ai.chat_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,                    -- Clerk user ID
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title TEXT,                               -- Auto-generated or user-provided
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_sessions_user_id ON ai.chat_sessions(user_id);
CREATE INDEX idx_chat_sessions_course_id ON ai.chat_sessions(course_id);
CREATE INDEX idx_chat_sessions_updated_at ON ai.chat_sessions(updated_at DESC);

CREATE TABLE ai.chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES ai.chat_sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_chat_messages_session_id ON ai.chat_messages(session_id);

-- Keep existing ai.message_sources table (no changes needed)
-- It references message_id as TEXT, which works with UUID::text
```

### ORM Schema (Drizzle)

```typescript
// lib/db/schema.ts
import { pgSchema, uuid, text, timestamp, integer, real, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const aiSchema = pgSchema('ai');

export const chatSessions = aiSchema.table('chat_sessions', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').notNull(),
  courseId: uuid('course_id').notNull(),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_chat_sessions_user_id').on(table.userId),
  index('idx_chat_sessions_course_id').on(table.courseId),
  index('idx_chat_sessions_updated_at').on(table.updatedAt),
]);

export const chatMessages = aiSchema.table('chat_messages', {
  id: uuid('id').primaryKey().defaultRandom(),
  sessionId: uuid('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  content: text('content').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_chat_messages_session_id').on(table.sessionId),
  check('role_check', sql`${table.role} IN ('user', 'assistant')`),
]);

export const messageSources = aiSchema.table('message_sources', {
  id: uuid('id').primaryKey().defaultRandom(),
  messageId: text('message_id').notNull(),
  sessionId: text('session_id').notNull(),
  sourceId: text('source_id').notNull(),
  sourceType: text('source_type').notNull(),
  chunkNumber: integer('chunk_number').notNull(),
  contentPreview: text('content_preview'),
  documentId: uuid('document_id'),
  slideNumber: integer('slide_number'),
  lectureId: uuid('lecture_id'),
  startSeconds: real('start_seconds'),
  endSeconds: real('end_seconds'),
  courseId: uuid('course_id'),
  ownerId: uuid('owner_id'),
  title: text('title'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_message_sources_message_id').on(table.messageId),
  index('idx_message_sources_session_id').on(table.sessionId),
]);
```

### API Routes

#### Chat Endpoint
```typescript
// app/api/chat/route.ts
import { streamText, tool } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { chatSessions, chatMessages, messageSources } from '@/lib/db/schema';
import { searchKnowledge } from '@/lib/ai/retrieval';
import { eq, and } from 'drizzle-orm';

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return new Response('Unauthorized', { status: 401 });

  const { messages, sessionId, courseId, documentId, lectureId } = await req.json();

  // Verify session ownership
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId)
    ),
  });
  if (!session) return new Response('Session not found', { status: 404 });

  // Save user message
  const userMessage = messages[messages.length - 1];
  const [savedUserMsg] = await db.insert(chatMessages).values({
    sessionId,
    role: 'user',
    content: userMessage.content,
  }).returning();

  // Collected sources during tool execution
  let collectedSources: RAGSource[] = [];

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const result = streamText({
    model: openrouter('anthropic/claude-sonnet-4'),
    system: SYSTEM_PROMPT,
    messages,
    tools: {
      search_course_materials: tool({
        description: 'Search lecture transcripts and slide content for relevant information',
        parameters: z.object({
          query: z.string().describe('The search query'),
        }),
        execute: async ({ query }) => {
          const { context, sources } = await searchKnowledge({
            query,
            userId,
            courseId,
            documentId,
            lectureId,
          });
          collectedSources = sources;
          return context;
        },
      }),
    },
    maxSteps: 3,
    onFinish: async ({ response }) => {
      // Save assistant message
      const assistantContent = response.messages
        .filter(m => m.role === 'assistant')
        .map(m => m.content.filter(c => c.type === 'text').map(c => c.text).join(''))
        .join('');

      const [savedAssistantMsg] = await db.insert(chatMessages).values({
        sessionId,
        role: 'assistant',
        content: assistantContent,
      }).returning();

      // Save sources
      if (collectedSources.length > 0) {
        await db.insert(messageSources).values(
          collectedSources.map(source => ({
            messageId: savedAssistantMsg.id,
            sessionId,
            sourceId: source.source_id,
            sourceType: source.source_type,
            chunkNumber: source.chunk_number,
            contentPreview: source.content_preview,
            documentId: source.document_id,
            slideNumber: source.slide_number,
            lectureId: source.lecture_id,
            startSeconds: source.start_seconds,
            endSeconds: source.end_seconds,
            courseId: source.course_id,
            ownerId: userId,
            title: source.title,
          }))
        ).onConflictDoNothing();
      }

      // Update session timestamp
      await db.update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
    },
  });

  // Stream response with sources as data
  return result.toDataStreamResponse({
    getErrorMessage: (error) => error.message,
    sendSources: true,
    data: collectedSources.length > 0 ? { sources: collectedSources } : undefined,
  });
}
```

#### Session Endpoints
```typescript
// app/api/sessions/route.ts
import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { chatSessions } from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// GET /api/sessions?courseId=xxx
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');

  const sessions = await db.query.chatSessions.findMany({
    where: courseId
      ? and(eq(chatSessions.userId, userId), eq(chatSessions.courseId, courseId))
      : eq(chatSessions.userId, userId),
    orderBy: desc(chatSessions.updatedAt),
  });

  return Response.json({ sessions });
}

// POST /api/sessions
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { courseId } = await req.json();

  const [session] = await db.insert(chatSessions).values({
    userId,
    courseId,
  }).returning();

  return Response.json({ session_id: session.id });
}
```

```typescript
// app/api/sessions/[id]/route.ts

// GET /api/sessions/[id]/messages
export async function GET(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = params.id;

  // Verify ownership
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)),
  });
  if (!session) return Response.json({ error: 'Not found' }, { status: 404 });

  // Load messages
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: asc(chatMessages.createdAt),
  });

  // Load sources for all messages
  const messageIds = messages.map(m => m.id);
  const sources = await db.query.messageSources.findMany({
    where: inArray(messageSources.messageId, messageIds),
    orderBy: asc(messageSources.chunkNumber),
  });

  // Group sources by message
  const sourcesByMessage = sources.reduce((acc, s) => {
    if (!acc[s.messageId]) acc[s.messageId] = [];
    acc[s.messageId].push(s);
    return acc;
  }, {} as Record<string, typeof sources>);

  return Response.json({
    messages: messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      created_at: m.createdAt,
      sources: sourcesByMessage[m.id] || null,
    })),
  });
}

// DELETE /api/sessions/[id]
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = params.id;

  // Verify ownership then delete (cascade deletes messages)
  const result = await db.delete(chatSessions)
    .where(and(eq(chatSessions.id, sessionId), eq(chatSessions.userId, userId)))
    .returning();

  if (result.length === 0) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }

  return Response.json({ success: true });
}
```

```typescript
// app/api/sessions/[id]/generate-title/route.ts
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = params.id;

  // Get first user message
  const firstMessage = await db.query.chatMessages.findFirst({
    where: and(eq(chatMessages.sessionId, sessionId), eq(chatMessages.role, 'user')),
    orderBy: asc(chatMessages.createdAt),
  });

  if (!firstMessage) {
    return Response.json({ error: 'No messages' }, { status: 400 });
  }

  // Simple title: truncate first message
  const title = firstMessage.content.slice(0, 50).trim() +
    (firstMessage.content.length > 50 ? '...' : '');

  await db.update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId));

  return Response.json({ session_name: title });
}
```

### RAG Retrieval Service

```typescript
// lib/ai/retrieval.ts
import { db } from '@/lib/db';
import { embed } from './embeddings';
import { sql } from 'drizzle-orm';

interface SearchOptions {
  query: string;
  userId: string;
  courseId: string;
  documentId?: string;
  lectureId?: string;
}

interface SearchResult {
  context: string;
  sources: RAGSource[];
}

export async function searchKnowledge(options: SearchOptions): Promise<SearchResult> {
  const { query, userId, courseId, documentId, lectureId } = options;

  // Get embedding for query
  const queryEmbedding = await embed(query);

  // Search slides (per-user, per-course)
  const slideResults = await searchSlides({
    embedding: queryEmbedding,
    userId,
    courseId,
    documentId,
    limit: 5,
  });

  // Search lectures (per-course, not per-user)
  const lectureResults = await searchLectures({
    embedding: queryEmbedding,
    courseId,
    lectureId,
    limit: 5,
  });

  // Combine and format
  const allResults = [...slideResults, ...lectureResults];
  const { context, sources } = formatRetrievalContext(allResults);

  return { context, sources };
}

async function searchSlides({ embedding, userId, courseId, documentId, limit }) {
  // pgvector similarity search with metadata filtering
  // Note: embedding is 1536-dim array from OpenRouter/OpenAI
  const vectorLiteral = `[${embedding.join(',')}]`;

  const results = await db.execute(sql`
    SELECT
      id,
      content,
      meta_data->>'document_id' as document_id,
      (meta_data->>'slide_number')::int as slide_number,
      meta_data->>'title' as title,
      meta_data->>'course_id' as course_id,
      1 - (embedding <=> ${vectorLiteral}::vector) as similarity
    FROM ai.slide_chunks_knowledge
    WHERE meta_data->>'owner_id' = ${userId}
      AND meta_data->>'course_id' = ${courseId}
      ${documentId ? sql`AND meta_data->>'document_id' = ${documentId}` : sql``}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return results.rows.map(r => ({
    type: 'slide' as const,
    content: r.content,
    documentId: r.document_id,
    slideNumber: r.slide_number,
    title: r.title,
    courseId: r.course_id,
    similarity: r.similarity,
  }));
}

async function searchLectures({ embedding, courseId, lectureId, limit }) {
  const vectorLiteral = `[${embedding.join(',')}]`;

  const results = await db.execute(sql`
    SELECT
      id,
      content,
      meta_data->>'lecture_id' as lecture_id,
      (meta_data->>'start_seconds')::float as start_seconds,
      (meta_data->>'end_seconds')::float as end_seconds,
      meta_data->>'title' as title,
      meta_data->>'course_id' as course_id,
      1 - (embedding <=> ${vectorLiteral}::vector) as similarity
    FROM ai.lecture_chunks_knowledge
    WHERE meta_data->>'course_id' = ${courseId}
      ${lectureId ? sql`AND meta_data->>'lecture_id' = ${lectureId}` : sql``}
    ORDER BY embedding <=> ${vectorLiteral}::vector
    LIMIT ${limit}
  `);

  return results.rows.map(r => ({
    type: 'lecture' as const,
    content: r.content,
    lectureId: r.lecture_id,
    startSeconds: r.start_seconds,
    endSeconds: r.end_seconds,
    title: r.title,
    courseId: r.course_id,
    similarity: r.similarity,
  }));
}

function formatRetrievalContext(results): { context: string; sources: RAGSource[] } {
  const sources: RAGSource[] = [];
  const contextParts: string[] = [];

  results.forEach((result, index) => {
    const chunkNumber = index + 1;

    if (result.type === 'slide') {
      contextParts.push(`[${chunkNumber}] (Slide ${result.slideNumber}) ${result.content}`);
      sources.push({
        source_id: `slide-${result.documentId}-${result.slideNumber}`,
        source_type: 'slide',
        content_preview: result.content.slice(0, 200),
        chunk_number: chunkNumber,
        document_id: result.documentId,
        slide_number: result.slideNumber,
        course_id: result.courseId,
        title: result.title,
      });
    } else {
      const timestamp = formatTimestamp(result.startSeconds);
      contextParts.push(`[${chunkNumber}] (Lecture @${timestamp}) ${result.content}`);
      sources.push({
        source_id: `lecture-${result.lectureId}-${result.startSeconds}`,
        source_type: 'lecture',
        content_preview: result.content.slice(0, 200),
        chunk_number: chunkNumber,
        lecture_id: result.lectureId,
        start_seconds: result.startSeconds,
        end_seconds: result.endSeconds,
        course_id: result.courseId,
        title: result.title,
      });
    }
  });

  return {
    context: contextParts.join('\n\n'),
    sources,
  };
}

function formatTimestamp(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return h > 0
    ? `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
    : `${m}:${s.toString().padStart(2, '0')}`;
}
```

### Embeddings Service

```typescript
// lib/ai/embeddings.ts
export async function embed(text: string, apiKey?: string): Promise<number[]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const { data } = await response.json();
  return data[0].embedding;
}
```

**Dimensions:** 1536 (OpenAI text-embedding-3-small default)

### System Prompt

```typescript
// lib/ai/prompts.ts
export const SYSTEM_PROMPT = `You are a friendly study companion helping students understand their course materials.

When answering questions:
1. Use the search_course_materials tool to find relevant information from lecture transcripts and slides
2. Cite your sources using [1], [2], etc. matching the reference numbers provided
3. Be concise but thorough
4. If you can't find relevant information, say so honestly

Citation format:
- Always cite sources when using retrieved information
- Use separate citations [1] [2], not combined [1,2]
- Citations should reference the numbered context provided by the search tool

Guidelines:
- Focus on explaining concepts clearly
- Use examples from the course materials when helpful
- If asked about something not in the materials, you can provide general knowledge but note it's not from the course`;
```

## Testing Setup

### Vitest Configuration

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['lib/**', 'app/api/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
});
```

```typescript
// vitest.setup.ts
import '@testing-library/jest-dom/vitest';
```

```json
// package.json scripts
{
  "scripts": {
    "test": "vitest",
    "test:run": "vitest run",
    "test:coverage": "vitest run --coverage"
  }
}
```

### Test Structure

```
__tests__/
├── lib/
│   ├── ai/
│   │   ├── embeddings.test.ts    # Mock OpenRouter, verify request format
│   │   ├── retrieval.test.ts     # Context formatting, source mapping
│   │   └── prompts.test.ts       # Prompt construction
│   └── db/
│       └── queries.test.ts       # Database query tests (needs test DB)
├── api/
│   ├── chat.test.ts              # Chat endpoint integration tests
│   └── sessions.test.ts          # Session CRUD tests
└── setup/
    └── test-db.ts                # Test database utilities
```

### Example Tests

```typescript
// __tests__/lib/ai/retrieval.test.ts
import { describe, it, expect } from 'vitest';
import { formatRetrievalContext } from '@/lib/ai/retrieval';

describe('formatRetrievalContext', () => {
  it('numbers slides and lectures sequentially', () => {
    const results = [
      { type: 'slide', content: 'Slide content', slideNumber: 5, documentId: 'doc-1' },
      { type: 'lecture', content: 'Lecture content', startSeconds: 120, lectureId: 'lec-1' },
    ];

    const { context, sources } = formatRetrievalContext(results);

    expect(context).toContain('[1] (Slide 5)');
    expect(context).toContain('[2] (Lecture @2:00)');
    expect(sources[0].chunk_number).toBe(1);
    expect(sources[1].chunk_number).toBe(2);
  });

  it('generates correct source_id for slides', () => {
    const results = [
      { type: 'slide', content: 'Test', slideNumber: 3, documentId: 'abc-123' },
    ];

    const { sources } = formatRetrievalContext(results);

    expect(sources[0].source_id).toBe('slide-abc-123-3');
  });
});
```

```typescript
// __tests__/lib/ai/embeddings.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { embed } from '@/lib/ai/embeddings';

describe('embed', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  it('calls OpenRouter with correct model', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    } as Response);

    await embed('test query');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('openai/text-embedding-3-small'),
      })
    );
  });

  it('uses provided API key when given', async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ embedding: [0.1, 0.2, 0.3] }] }),
    } as Response);

    await embed('test query', 'user-api-key');

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer user-api-key',
        }),
      })
    );
  });
});
```

## Frontend Changes

### Minimal Changes Required

The frontend already uses AI SDK v6 with `useAIChat`. Key changes:

1. **Update API endpoint** in `hooks/useChat.ts`:
```typescript
// Change from:
const apiUrl = `${API_BASE}/agent/chat`;
// To:
const apiUrl = `/api/chat`;
```

2. **Update session API calls** in `lib/api.ts`:
```typescript
// Change base URL from external backend to local API routes
// Most endpoints stay the same, just different base URL
```

3. **Source handling** - Already implemented correctly with `onData` callback.

### Optional Improvements

1. **Use AI SDK's built-in source streaming** instead of custom `data-rag-source`:
```typescript
// In chat route, return sources via toDataStreamResponse options
// In frontend, access via message.experimental_attachments or data stream
```

2. **Simplify session management** - AI SDK can manage conversation state.

## Migration Tasks

### Task 1: Database Setup
- [ ] Install Drizzle ORM and dependencies
- [ ] Configure Drizzle with existing PostgreSQL
- [ ] Create migration for `chat_sessions` and `chat_messages` tables
- [ ] Run migration (additive, doesn't affect existing tables)

### Task 2: Core Infrastructure
- [ ] Set up `lib/db/` with Drizzle client and schema
- [ ] Set up `lib/ai/` directory structure
- [ ] Implement embeddings service (decision: OpenRouter vs Voyage AI)
- [ ] Implement retrieval service with pgvector queries

### Task 3: Chat API Route
- [ ] Create `/api/chat/route.ts` with streamText
- [ ] Implement search tool with RAG retrieval
- [ ] Implement message persistence (user + assistant)
- [ ] Implement source persistence
- [ ] Test streaming end-to-end

### Task 4: Session API Routes
- [ ] Create `/api/sessions/route.ts` (list, create)
- [ ] Create `/api/sessions/[id]/route.ts` (get messages, delete)
- [ ] Create `/api/sessions/[id]/generate-title/route.ts`
- [ ] Test all CRUD operations

### Task 5: Frontend Integration
- [ ] Update `useChat.ts` to use local API route
- [ ] Update `lib/api.ts` session endpoints
- [ ] Verify citation display works
- [ ] Verify session management works

### Task 6: Testing & Validation
- [ ] Test with existing knowledge base (slides + lectures)
- [ ] Verify citations link to correct content
- [ ] Test session persistence across page refresh
- [ ] Test concurrent sessions
- [ ] Compare response quality with Python backend

## Embedding Model Decision

**Decision:** OpenRouter embeddings from day one.

**Model:** `openai/text-embedding-3-small` via OpenRouter (1536 dimensions)

**Rationale:**
- Existing knowledge base is test data only - no migration needed
- Single API (OpenRouter) for both LLM and embeddings
- BYOK-ready: when users connect OpenRouter, embeddings use their key too
- Only operator expense: Whisper GPU server for transcription

```typescript
// lib/ai/embeddings.ts
export async function embed(text: string, apiKey?: string): Promise<number[]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;

  const response = await fetch('https://openrouter.ai/api/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'openai/text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const { data } = await response.json();
  return data[0].embedding;
}
```

**Note:** Knowledge tables need 1536-dimension vectors (not 512). Migration will create new tables or alter existing.

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| Response quality differs | A/B test same queries, compare outputs |
| Citation numbering mismatch | Unit test context formatter |
| Session data loss | Run both backends in parallel during transition |
| Embedding compatibility | Keep Voyage AI initially |
| Performance regression | Monitor response times, optimize queries |

## Success Criteria

1. **Functional:** Chat works end-to-end with citations
2. **Parity:** Same quality responses as Python backend
3. **Performance:** Streaming starts within 500ms
4. **Persistence:** Sessions survive page refresh
5. **No Agno:** Zero Agno dependencies in new code

## Dependencies

**Package manager:** pnpm

```bash
# Core dependencies
pnpm add drizzle-orm postgres @openrouter/ai-sdk-provider

# Dev dependencies
pnpm add -D drizzle-kit dotenv

# Testing
pnpm add -D vitest @vitejs/plugin-react @testing-library/react @testing-library/dom jsdom
```

- `drizzle-orm` + `drizzle-kit` - ORM and migrations
- `@openrouter/ai-sdk-provider` - OpenRouter integration (LLM + embeddings)
- `ai` (already installed) - Vercel AI SDK
- `postgres` - PostgreSQL driver for Drizzle
- `dotenv` - Environment variable loading (for drizzle-kit)
- `vitest` - Test runner
- `@testing-library/react` - React component testing
- `jsdom` - DOM environment for tests

## Related Specs

- [Migration Overview](./00-overview.md)
- [Backend Architecture](../../architecture.md) (Python, for reference)
- [Frontend Architecture](../architecture.md)

## Next Steps

1. Review and approve this spec
2. Create detailed task files for each migration task
3. Start with Task 1 (Database Setup)
4. Iterate through tasks, testing at each step
