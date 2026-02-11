# Streaming Performance

**Status:** Accepted

## Overview

This spec documents the performance optimizations applied to the chat streaming and input handling system. The original implementation had severe performance issues causing 3.5+ second freezes during typing and streaming.

## Problem Statement

### Symptoms
- 3.5+ second freeze on keyboard input
- 2.3 second input delay (before handlers even fired)
- UI completely unresponsive during typing AND streaming
- Main thread blocked entirely

### Root Causes Identified
1. **Clerk `getToken()` blocking** - Synchronous auth calls on every render
2. **Controlled input in parent** - Every keystroke re-rendered entire component tree
3. **AI SDK default behavior** - Renders on every token received
4. **Shiki syntax highlighting** - Expensive during streaming
5. **KaTeX math rendering** - Expensive during streaming

## Solution Architecture

### Component Hierarchy

```
StudyBuddyClient.tsx (no input state)
├── useChat hook (no input state, cached tokens)
│   └── AI SDK useAIChat (experimental_throttle: 50)
├── MainContent.tsx (passes callbacks only)
│   ├── MessageList.tsx (memo) ← only re-renders on message changes
│   │   └── MessageBubble.tsx (memo) ← custom comparison
│   │       └── MarkdownMessage.tsx (memo) ← Shiki disabled during streaming
│   └── ChatInput.tsx (LOCAL state) ← fully isolated
└── Other panels...
```

### Key Files

| File | Purpose |
|------|---------|
| `hooks/useChat.ts` | Chat state management with token caching and AI SDK throttling |
| `components/Chat/ChatInput.tsx` | Isolated input with local state |
| `components/Chat/MessageList.tsx` | Memoized message list container |
| `components/Chat/MessageBubble.tsx` | Memoized individual message with custom comparison |
| `components/Chat/MarkdownMessage.tsx` | Streamdown wrapper with conditional Shiki |
| `components/MainContent/MainContent.tsx` | Layout container (no input state) |
| `components/StudyBuddyClient.tsx` | Root client component |

## Implementation Details

### 1. Clerk Token Caching (`hooks/useChat.ts`)

```tsx
const tokenCacheRef = useRef<{ token: string | null; expires: number }>({
  token: null,
  expires: 0
});

const getCachedToken = useCallback(async () => {
  const now = Date.now();
  if (tokenCacheRef.current.token && now < tokenCacheRef.current.expires) {
    return tokenCacheRef.current.token;
  }
  const token = await getTokenRef.current();
  tokenCacheRef.current = { token, expires: now + 55000 }; // 55 sec cache
  return token;
}, []);
```

### 2. Local Input State (`components/Chat/ChatInput.tsx`)

```tsx
// Input manages its own state - parent never re-renders on typing
function ChatInput({ onSendMessage, ... }) {
  const [localInput, setLocalInput] = useState("");

  const handleSend = () => {
    onSendMessage(localInput.trim());
  };

  return <Textarea value={localInput} onChange={e => setLocalInput(e.target.value)} />;
}
```

### 3. AI SDK Throttling (`hooks/useChat.ts`)

```tsx
useAIChat({
  experimental_throttle: 50, // Batch updates, max 20 renders/sec
  // ...
});
```

### 4. Conditional Shiki (`components/Chat/MarkdownMessage.tsx`)

```tsx
const enableSyntaxHighlighting = !isStreaming;

<Streamdown
  shikiTheme={enableSyntaxHighlighting ? ["github-light", "github-dark"] : undefined}
  controls={{ code: enableSyntaxHighlighting, table: true, mermaid: false }}
  plugins={enableSyntaxHighlighting ? { math: mathPlugin } : {}}
>
```

### 5. Memoized Components

**MessageBubble** - Custom comparison:
```tsx
memo(MessageBubble, (prev, next) => {
  if (prev.message.isStreaming !== next.message.isStreaming) return false;
  if (next.message.isStreaming) {
    return prev.message.content === next.message.content;
  }
  return prev.message.id === next.message.id &&
         prev.message.content === next.message.content;
});
```

**MessageList** - Standard memo, only re-renders when messages array changes.

## Performance Results

| Metric | Before | After |
|--------|--------|-------|
| Input delay | 2.3 seconds | ~instant |
| Keystroke response | 3.5+ seconds | <50ms |
| Streaming smoothness | Freezes UI | Responsive |

## Dependencies

| Package | Version | Notes |
|---------|---------|-------|
| `@ai-sdk/react` | ^3.0.69 | `experimental_throttle` required |
| `ai` | ^6.0.67 | Vercel AI SDK |
| `streamdown` | ^2.1.0 | Streaming markdown |
| `@clerk/nextjs` | ^6.36.4 | Token caching needed |
| `react` | 19.2.1 | Bleeding edge |
| `next` | 16.0.10 | Bleeding edge |

## Future Scope

### High Priority

1. **Virtual scrolling for messages**
   - Current: All messages render in DOM
   - Issue: Long conversations (100+ messages) will degrade performance
   - Solution: Use `react-window` or `@tanstack/virtual` for message list

2. **Web Worker for markdown parsing**
   - Move Streamdown parsing to web worker
   - Main thread stays responsive during complex markdown

3. **Incremental Shiki highlighting**
   - Highlight code blocks progressively after streaming
   - Currently all highlighting happens at once when streaming ends

### Medium Priority

4. **Message pagination/lazy loading**
   - Only load recent messages initially
   - Fetch older messages on scroll up

5. **Optimistic UI for sending**
   - Show user message immediately
   - Don't wait for server acknowledgment

6. **Debounced citation preprocessing**
   - Citation regex runs on every content change during streaming
   - Could debounce or move to effect

### Low Priority / Experimental

7. **React 18 downgrade evaluation**
   - Next.js 16 + React 19 are bleeding edge
   - May have unresolved performance bugs
   - Consider Next.js 15 + React 18 for stability

8. **AI SDK Chat instance pattern**
   - Official docs show shared `Chat` instance created outside component
   - May provide better state management

9. **Service Worker for response caching**
   - Cache completed responses
   - Instant load for revisited sessions

## Related Specs

- [markdown-rendering.md](./markdown-rendering.md) - Streamdown integration
- [source-saving-pipeline.md](./source-saving-pipeline.md) - Source persistence during streaming
- [resilient-chat-requests.md](./resilient-chat-requests.md) - Disconnect handling

## References

- [AI SDK useChat throttling](https://sdk.vercel.ai/docs/ai-sdk-ui/chatbot#throttling-ui-updates)
- [AI SDK memoization cookbook](https://sdk.vercel.ai/cookbook/next/markdown-chatbot-with-memoization)
- [Clerk getToken performance issue](https://www.answeroverflow.com/m/1393494473346125965)
- [Streamdown documentation](https://github.com/vercel/streamdown)
