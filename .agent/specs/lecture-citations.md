# Lecture Citations Spec

**Status:** Accepted

## Problem

Lecture citations in chat responses are not clickable. The UI shows `[1]`, `[2]` etc. but clicking them does nothing because the source metadata isn't reaching the frontend.

## Current Situation

### What Works
1. **Lecture chunks are stored correctly** - `ai.lecture_chunks_knowledge` table has chunks with metadata (`lecture_id`, `start_seconds`, `end_seconds`, `course_id`, `title`)
2. **RAG search returns sources** - `searchKnowledge()` in `lib/ai/index.ts` returns `{ context, sources }` where sources include lecture metadata
3. **Sources are collected in chat route** - `collectedSources` array is populated during tool execution (line 125 of `app/api/chat/route.ts`)
4. **Sources are saved to database** - `ai.message_sources` table stores sources after stream completes
5. **Frontend components exist** - `CitationLink`, `MarkdownMessage`, and `handleCitationClick` are all implemented and wired up

### What's Broken
The streaming response does NOT include sources:

```typescript
// app/api/chat/route.ts:193
return result.toUIMessageStreamResponse({
  originalMessages: messages,
  // Sources are NOT sent to frontend!
});
```

The `collectedSources` array is populated but never sent in the stream. The frontend receives text with `[1]`, `[2]` markers but no `RAGSource[]` data to match them to.

## Target Situation

Citations should be clickable and navigate to the lecture at the correct timestamp:
1. Click `[1]` → Video panel expands, Panopto embed jumps to `start_seconds`
2. Hover shows tooltip: "Lecture Title @ 12:34"

### Required Changes

1. **Send sources in stream** - Use AI SDK's data streaming mechanism to send `RAGSource[]` to frontend during/after tool execution
2. **Frontend receives sources** - `useChat` hook's message should include `sources` array
3. **Match citations to sources** - `chunk_number` in source matches `[N]` in text

### Reference: Legacy Implementation

The legacy Python backend used custom SSE events:
- `data-rag-source` - Custom event with full source metadata
- `source-document` - Native Vercel format for UI compatibility

See `.legacy/app/adapters/vercel_stream.py` for the `AgnoVercelAdapter` class that handled this.

### Files to Modify

1. `app/api/chat/route.ts` - Send sources in stream
2. Possibly `lib/ai/index.ts` - Ensure `searchKnowledge` returns properly formatted sources
3. Frontend may need updates depending on how AI SDK sends data

### AI SDK Options

1. **`toDataStreamResponse`** with annotations - Can include arbitrary data
2. **`experimental_streamData`** - Stream metadata alongside text
3. **Custom SSE** - Manual SSE like legacy code (more work)

Check AI SDK v6 docs for current best practice.

## Implementation (Completed)

Used AI SDK v6's `createUIMessageStream` pattern:

```typescript
const stream = createUIMessageStream({
  execute: async ({ writer }) => {
    const result = streamText({
      tools: {
        search_course_materials: tool({
          execute: async ({ query }) => {
            const { context, sources } = await searchKnowledge({...});

            // Stream sources immediately after RAG retrieval
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
    });

    writer.merge(result.toUIMessageStream());
  },
});

return createUIMessageStreamResponse({ stream });
```

**Data flow:**
1. Tool executes → RAG retrieval returns sources
2. Sources streamed via `writer.write({ type: 'data-rag-source', data: source })`
3. Frontend `onData` callback receives sources → `setStreamingSources()`
4. Citations `[N]` matched to sources → `CitationLink` rendered
5. Click → `handleCitationClick` navigates to timestamp
