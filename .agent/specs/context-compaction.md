# Context Window Compaction

**Status:** Accepted

## Problem

Long chat sessions accumulate messages that eventually exceed the model's context window (DeepSeek V3.2: 128k tokens). Even with `pruneMessages` stripping old tool call results, the raw conversation text will hit limits in extended study sessions.

## Solution: Two-Layer Approach

### Layer 1: Token Tracking (Visibility)

Track `promptTokens` after each response so we know how close sessions are to the limit.

**Implementation:**
1. Enable OpenRouter usage accounting: `usage: { include: true }` on the model config
2. Add `lastPromptTokens` column to `chatSessions`
3. In `onFinish`, read `result.providerMetadata.openrouter.usage.promptTokens` and store on session

This is passive — no behavior change, just data collection.

### Layer 2: Compaction (Active)

When `lastPromptTokens` exceeds a threshold, summarize older messages and replace them in the LLM context.

**Key principle:** Compaction only affects what the LLM sees. The DB keeps all messages and sources permanently. The frontend loads from DB, so citations and full history remain intact.

### Compaction Flow

```
User sends message
  → Load session (summary, lastPromptTokens, compactedAt)
  → Build LLM messages:
      If summary exists:
        [summary as system message] + [messages after compaction point]
      Else:
        [all messages]
  → If lastPromptTokens > COMPACTION_THRESHOLD:
      1. Fetch full message history from DB for this session
      2. Send to a large context model with compaction prompt
      3. Model returns <summary>...</summary>
      4. Store summary, compactedAt, compactedBeforeMessageId on session
      5. Rebuild LLM messages: [summary] + [last 8 messages]
  → pruneMessages (strip tool calls from all but last 8)
  → streamText
  → After response: store promptTokens on session
```

### Configuration

| Setting | Value | Rationale |
|---------|-------|-----------|
| `COMPACTION_THRESHOLD` | 131,000 tokens | ~80% of DeepSeek V3.2's 163,840 context |
| Messages kept after compaction | 8 | Enough recent context for natural conversation |
| `pruneMessages` tool call retention | Last 8 messages | Matches compaction retention window |
| Minimum threshold | 50,000 tokens | Don't compact too early |

### Schema Changes

Add to `chatSessions` table:

```typescript
// New columns
lastPromptTokens: integer('last_prompt_tokens'),
summary: text('summary'),
compactedAt: timestamp('compacted_at', { withTimezone: true }),
compactedBeforeMessageId: uuid('compacted_before_message_id'),
```

- `lastPromptTokens` — updated after every response
- `summary` — the compacted conversation summary, replaces all messages before the compaction point
- `compactedAt` — timestamp for debugging (when did compaction last run)
- `compactedBeforeMessageId` — the message ID boundary; messages before this are covered by the summary

### Compaction Prompt

```
Summarize the following conversation between a student and StudyBuddy (an AI study assistant for the course "{courseCode} - {courseTitle}").

Preserve:
- Key topics and concepts discussed
- Questions the student asked and the answers given
- Any specific course material referenced (lecture topics, slide content)
- The current thread of discussion and any unresolved questions
- Important context the assistant would need to continue helping naturally

Be concise but thorough. The assistant will use this summary as context to continue the conversation.
```

### Model for Compaction

Use a cheap, fast model via OpenRouter for the summarization call. The compaction model needs:
- Large enough context to read the full conversation
- Fast (this blocks the user's request)
- Cheap (runs on every compaction trigger)

Candidates: `deepseek/deepseek-v3.2` (same model, 128k context) or a cheaper alternative.

### How Citations Survive

1. Sources are saved per-message in the DB via `saveSourcesWithDedup`
2. Frontend `loadMessages` fetches messages WITH their sources from DB
3. Compaction only replaces messages in the LLM context, not in the DB
4. User sees full history with all citations — only the LLM's view is compacted

### Edge Cases

| Case | Handling |
|------|----------|
| First message in session | No compaction, no summary — just track tokens |
| Session already has summary + new compaction triggered | Re-summarize: send summary + all messages since last compaction to model, generate new summary |
| Compaction model fails | Log warning, skip compaction, continue with full messages (may hit context limit) |
| `lastPromptTokens` is null (old sessions) | Skip threshold check, track tokens going forward |
| Session with < 8 messages | Never triggers compaction (too few messages) |

### Files to Modify

- `lib/db/schema.ts` — add new columns to `chatSessions`
- `app/api/chat/route.ts` — token tracking in `onFinish`, compaction logic before `streamText`
- `lib/ai/compaction.ts` — new file: compaction prompt, summary generation, message rebuilding
- Drizzle migration — new columns

### Verification

1. **Token tracking:** Check `lastPromptTokens` updates in DB after each chat response
2. **Compaction trigger:** Manually set `lastPromptTokens` above threshold, send a message, verify summary is generated
3. **Citations intact:** After compaction, verify frontend still shows all messages with clickable citations
4. **Summary quality:** Review generated summaries for key context preservation
5. **Logs:** `[Chat] Compacting session {id} (promptTokens: {n})` and `[Chat] Compaction complete, summary: {length} chars`

## Related

- [chat-streaming.md](./chat-streaming.md) — AI SDK integration, streaming setup
- [message-sources-persistence.md](./message-sources-persistence.md) — how sources are saved and loaded
- [resilient-chat-requests.md](./resilient-chat-requests.md) — disconnect handling, after() usage
