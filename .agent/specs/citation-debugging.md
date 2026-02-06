# Citation/References Debugging

**Status:** Investigation Needed

## Issue Summary

Citations (references like `[1]`, `[2]`) in AI responses sometimes fail to render as clickable links. Some messages have working citations while others don't.

## How Citations Work

### Data Flow

1. **During Streaming**
   - Backend sends `data-rag-source` events via SSE stream
   - `useChat.ts` captures these in `onData` callback → `streamingSources` state
   - `MarkdownMessage` receives sources and renders `CitationLink` components

2. **After Streaming Completes**
   - `onFinish` callback saves `streamingSources` to `sourcesMap[message.id]`
   - Sources are cleared from `streamingSources`

3. **Loading History**
   - `api.sessions.getMessages()` fetches messages with sources from backend
   - Sources stored in `loadedSourcesMap` keyed by `message.id`
   - Backend reads from `ai.message_sources` table

### Citation Rendering (MarkdownMessage.tsx)

```tsx
// Citations [1] are preprocessed to [[1]](#cite-1) markdown links
// Then rendered via custom `a` component:
const source = sources.find((s) => s.chunk_number === chunkNumber);
if (source) {
  return <CitationLink ... />;  // Clickable
}
return <span>...</span>;  // Disabled/broken
```

## Potential Failure Points

### 1. Sources Not Sent by Backend
- Backend `/api/chat` route may not emit `data-rag-source` events
- RAG pipeline may not return sources for certain queries

### 2. Message ID Mismatch
- `message.id` at streaming time differs from `message.id` at retrieval
- AI SDK may regenerate IDs causing sourcesMap lookup to fail

### 3. chunk_number Mismatch
- Backend sends sources with `chunk_number` values that don't match citation numbers
- Citations in text are [1], [2] but sources have different numbering

### 4. Race Condition
- `setStreamingSources([])` in `sendMessage` could clear sources before `onFinish` saves them
- Unlikely but possible with rapid message sending

### 5. History Loading Issues
- Backend `GET /api/sessions/[id]/messages` doesn't return sources
- `ai.message_sources` table missing entries for that message

## Debugging Steps

1. **Check browser console** for errors when clicking broken citations

2. **Verify streaming sources**
   ```js
   // In useChat.ts onData callback, add:
   console.log('RAG source received:', dataPart);
   ```

3. **Verify onFinish saves sources**
   ```js
   // In useChat.ts onFinish callback, add:
   console.log('Saving sources for message:', message.id, currentSources);
   ```

4. **Check backend message_sources table**
   ```sql
   SELECT * FROM ai.message_sources
   WHERE message_id = '<broken-message-id>';
   ```

5. **Verify API response includes sources**
   - Network tab → `/api/sessions/[id]/messages` → check response

## Key Files

- `hooks/useChat.ts` - Source state management (lines 19-20, 140-167, 193-200)
- `components/Chat/MarkdownMessage.tsx` - Citation rendering (lines 69-96)
- `components/Chat/CitationLink.tsx` - Clickable citation component
- `app/api/sessions/[id]/messages/route.ts` - History loading API
- `lib/db/schema.ts` - `messageSources` table definition

## Related Specs

- [message-sources-persistence.md](./message-sources-persistence.md) - RAG sources persistence
- [lecture-citations.md](./lecture-citations.md) - Lecture citation links
- [chat-streaming.md](./chat-streaming.md) - AI SDK streaming integration
