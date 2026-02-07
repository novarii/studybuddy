# Resilient Chat Requests

**Status:** Accepted

## Problem

When a user sends a message and the LLM is streaming a response, if they:
- Switch to a different session
- Refresh the page
- Close the browser

The response and its sources could be **lost**. By default, the AI SDK uses backpressure — when the client disconnects, the LLM stream is aborted and `onFinish` never fires, preventing DB persistence.

## Solution: `consumeStream()`

The AI SDK provides `result.consumeStream()` (called without `await`) which removes backpressure and ensures the LLM stream runs to completion server-side, regardless of client state. This guarantees `onFinish` fires and all persistence logic executes.

**Implementation:**
```typescript
const result = streamText({
  model: openrouter.chat('deepseek/deepseek-v3.2'),
  messages: modelMessages,
  onFinish: async ({ response, usage }) => {
    // This ALWAYS fires, even if client disconnected
    await db.insert(chatMessages).values({ ... });
    await saveSourcesWithDedup(...);
    await db.update(chatSessions).set({ ... });
  },
});

// Consume stream server-side so onFinish fires on client disconnect
result.consumeStream(); // no await!

writer.merge(result.toUIMessageStream());
```

**Key insight:** All persistence (assistant message, sources, token tracking, compaction metadata) lives directly in `onFinish`, not in `after()`. The `consumeStream()` call is what guarantees execution.

### Why not `after()`?

`after()` from `next/server` was tried previously but **silently failed** because:
1. It was registered *inside* `onFinish`
2. If `onFinish` never fired (due to stream abort), `after()` was never registered
3. The assistant message appeared to save intermittently (when LLM finished before client fully disconnected), but sources were consistently lost

### What the user sees

When switching sessions mid-response and switching back:
- The completed assistant message appears (loaded from DB)
- All citations/sources are intact (saved in `onFinish`)
- No streaming animation (the stream already completed server-side)

## Stream Resumption (Evaluated, Not Implemented)

The AI SDK supports `useChat({ resume: true })` for reconnecting to active streams, but:

- **Requires Redis** — `resumable-stream` package buffers SSE data in Redis pub/sub
- **Requires a GET endpoint** — separate route to reconnect (`/api/chat/[id]/stream`)
- **Incompatible with `stop()`** — cannot use both resume and abort functionality
- **Marginal UX gain** — only adds the live typing animation on return; the message content is already persisted and displayed via DB load

**Decision:** Not worth the infrastructure cost. `consumeStream()` ensures data integrity, which is the critical requirement.

## Related Files

- `app/api/chat/route.ts` — Chat endpoint with `consumeStream()` + `onFinish` persistence
- `lib/sources/deduplicated-sources.ts` — Source deduplication and save logic
- `lib/db/schema.ts` — Message and session schema

## References

- [AI SDK: Handling client disconnects](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-message-persistence#handling-client-disconnects)
- [AI SDK: Stopping streams](https://ai-sdk.dev/docs/advanced/stopping-streams)
- [AI SDK: Stream abort troubleshooting](https://ai-sdk.dev/docs/troubleshooting/stream-abort-handling)
- [AI SDK: Resumable streams](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot-resume-streams)
