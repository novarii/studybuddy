# Resilient Chat Requests

**Status:** Proposed

## Problem

When a user sends a message and the LLM is streaming a response, if they:
- Switch to a different session/tab
- Refresh the page
- Close the browser

The response is **lost**. The `onFinish` callback in `/api/chat` never runs because the HTTP request is aborted when the client disconnects.

**Current flow:**
```
Client sends message → Server streams response → Client receives → onFinish saves to DB
                                                       ↑
                                           Client disconnect = message lost
```

## Proposed Solutions

### Option 1: Background Job Queue (Recommended)

Use **Inngest** (or BullMQ/Trigger.dev) to decouple LLM processing from client connection.

**Flow:**
```
Client sends message → Save user message to DB
                     → Create Inngest job
                     → Return job ID immediately

Inngest worker (independent):
                     → Call LLM
                     → Save assistant message to DB
                     → Emit completion event

Client:
                     → Subscribe to updates OR poll for completion
                     → Display response when ready
```

**Pros:**
- Fully resilient - survives any client disconnect
- Scalable - jobs can be distributed
- Retryable - failed LLM calls can retry automatically

**Cons:**
- Additional infrastructure (Inngest account)
- Streaming UX requires Inngest Realtime (beta) or custom SSE
- More complex architecture

**Implementation steps:**
1. `pnpm add inngest`
2. Create `/lib/inngest/client.ts`
3. Create `/lib/inngest/functions/process-chat.ts`
4. Create `/app/api/inngest/route.ts` (serve endpoint)
5. Modify `/app/api/chat/route.ts` to trigger job
6. Add polling or subscription on frontend
7. Update `useChat` hook to handle async responses

**Estimated effort:** 1-2 days

---

### Option 2: Pending Message Pattern (Simpler)

Save a "pending" message before streaming, update on completion.

**Flow:**
```
Client sends message → Save user message to DB
                     → Save "pending" assistant message to DB (content = null, status = "pending")
                     → Start streaming
                     → onFinish: Update message with real content, status = "complete"

If client disconnects:
                     → User refreshes, sees "pending" message
                     → Can retry or message eventually completes
```

**Schema change:**
```sql
ALTER TABLE ai.chat_messages ADD COLUMN status TEXT DEFAULT 'complete';
-- Values: 'pending', 'streaming', 'complete', 'failed'
```

**Pros:**
- Minimal refactor
- Keeps existing streaming UX
- User at least sees something on refresh

**Cons:**
- Doesn't actually save the response if server aborts
- Just a better UX for failure, not a real fix

**Estimated effort:** 2-3 hours

---

### Option 3: Fire-and-Forget with Detached Processing

Use Node.js patterns to continue processing after response ends.

**Concept:**
```typescript
// Don't await the LLM processing
export async function POST(req: Request) {
  const { sessionId, message } = await req.json();

  // Save user message
  await saveUserMessage(sessionId, message);

  // Start processing WITHOUT awaiting
  processLLMInBackground(sessionId, message).catch(console.error);

  // Return immediately
  return Response.json({ status: 'processing' });
}
```

**Pros:**
- Simple concept
- No external dependencies

**Cons:**
- Doesn't work well with serverless/edge (function terminates)
- Loses streaming UX entirely
- Unreliable in Next.js environment

**Not recommended** for Next.js/Vercel deployment.

---

## Recommendation

**Short-term (Option 2):** Implement pending message pattern for better UX on disconnect. Quick win, 2-3 hours.

**Long-term (Option 1):** Migrate to Inngest for true resilience. Plan for 1-2 days of work when priorities allow.

## Related Files

- `app/api/chat/route.ts` - Current chat endpoint
- `hooks/useChat.ts` - Frontend chat hook
- `lib/db/schema.ts` - Message schema (needs status column for Option 2)

## References

- [Inngest Next.js Guide](https://www.inngest.com/docs/guides/nextjs)
- [Vercel AI SDK Background Functions](https://sdk.vercel.ai/docs)
