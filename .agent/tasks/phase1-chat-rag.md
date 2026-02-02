# Phase 1 Tasks: Chat + RAG Migration

**Spec Reference:** [01-chat-rag-migration.md](../specs/migration/01-chat-rag-migration.md)

## Task Overview

| Task | Description | Dependencies | Effort |
|------|-------------|--------------|--------|
| 1 | Project Setup (Drizzle + Vitest) | None | Small |
| 2 | Core Infrastructure | Task 1 | Medium |
| 3 | Chat API Route | Task 2 | Large |
| 4 | Session API Routes | Task 1 | Medium |
| 5 | Frontend Integration | Tasks 3, 4 | Small |
| 6 | Testing & Validation | Task 5 | Medium |

---

## Task 1: Project Setup (Drizzle + Vitest)

**Goal:** Set up Drizzle ORM, Vitest, and create new chat tables.

### Subtasks - Drizzle
- [x] 1.1 Install dependencies via pnpm: `drizzle-orm`, `drizzle-kit`, `postgres`, `dotenv`
- [x] 1.2 Create `drizzle.config.ts` - Drizzle Kit configuration
- [x] 1.3 Create `lib/db/client.ts` with connection pool
- [x] 1.4 Create `lib/db/schema.ts` with `chatSessions`, `chatMessages` tables
- [x] 1.5 Add existing `messageSources` table to schema (for type safety)
- [x] 1.6 Generate migration with `drizzle-kit generate`
- [x] 1.7 Run migration against dev database
- [x] 1.8 Verify tables created in `ai` schema

### Subtasks - Vitest
- [x] 1.9 Install test dependencies: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/dom`, `jsdom`
- [x] 1.10 Create `vitest.config.ts`
- [x] 1.11 Create `vitest.setup.ts`
- [x] 1.12 Add test scripts to `package.json`
- [x] 1.13 Create `__tests__/` directory structure
- [x] 1.14 Verify setup with a trivial test

### Deliverables
- `lib/db/client.ts` - Database connection
- `lib/db/schema.ts` - Drizzle schema definitions
- `drizzle/migrations/` - Generated SQL migration
- `drizzle.config.ts` - Drizzle Kit configuration
- `vitest.config.ts` - Vitest configuration
- `vitest.setup.ts` - Test setup file
- `__tests__/` - Test directory structure

---

## Task 2: Core Infrastructure

**Goal:** Set up AI/embedding services that the chat route depends on.

### Subtasks
- [x] 2.1 Create `lib/ai/embeddings.ts` with OpenRouter embed function
- [x] 2.2 Create `lib/ai/retrieval.ts` with pgvector search functions
- [x] 2.3 Create `lib/ai/prompts.ts` with system prompt
- [x] 2.4 Create `lib/ai/types.ts` with RAGSource and related types
- [x] 2.5 Test embedding function in isolation
- [x] 2.6 Test retrieval against knowledge tables (may need dimension update)

### Environment Variables Needed
```
DATABASE_URL=xxx            # PostgreSQL connection
OPENROUTER_API_KEY=xxx      # For LLM + embeddings
```

### Subtasks - Tests
- [x] 2.7 Write tests for `embeddings.ts` (mock fetch)
- [x] 2.8 Write tests for `retrieval.ts` (context formatting)

### Deliverables
- `lib/ai/embeddings.ts` - OpenRouter embedding function
- `lib/ai/retrieval.ts` - pgvector search with dual retriever
- `lib/ai/prompts.ts` - System prompt constant
- `lib/ai/types.ts` - TypeScript types
- `__tests__/lib/ai/embeddings.test.ts`
- `__tests__/lib/ai/retrieval.test.ts`

---

## Task 3: Chat API Route

**Goal:** Implement streaming chat with RAG using AI SDK.

### Subtasks
- [ ] 3.1 Create `app/api/chat/route.ts` with POST handler
- [ ] 3.2 Implement auth check (Clerk)
- [ ] 3.3 Implement session ownership verification
- [ ] 3.4 Implement `search_course_materials` tool
- [ ] 3.5 Implement user message persistence
- [ ] 3.6 Implement assistant message persistence (onFinish)
- [ ] 3.7 Implement source persistence (onFinish)
- [ ] 3.8 Test streaming response format
- [ ] 3.9 Test with frontend (manual)

### Key Implementation Details
- Use `streamText` from `ai` package
- Use `@openrouter/ai-sdk-provider` for model
- Tool executes RAG search, collects sources
- `onFinish` callback saves messages + sources
- Return `toDataStreamResponse()`

### Deliverables
- `app/api/chat/route.ts` - Full chat endpoint

---

## Task 4: Session API Routes

**Goal:** Implement session CRUD endpoints.

### Subtasks
- [ ] 4.1 Create `app/api/sessions/route.ts` (GET list, POST create)
- [ ] 4.2 Create `app/api/sessions/[id]/route.ts` (GET messages, DELETE)
- [ ] 4.3 Create `app/api/sessions/[id]/generate-title/route.ts`
- [ ] 4.4 Add auth checks to all endpoints
- [ ] 4.5 Add ownership verification
- [ ] 4.6 Test with curl/Postman

### Endpoint Summary
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/sessions` | List sessions (optional courseId filter) |
| POST | `/api/sessions` | Create new session |
| GET | `/api/sessions/[id]/messages` | Get messages with sources |
| DELETE | `/api/sessions/[id]` | Delete session (cascade) |
| POST | `/api/sessions/[id]/generate-title` | Auto-generate title |

### Deliverables
- `app/api/sessions/route.ts`
- `app/api/sessions/[id]/route.ts`
- `app/api/sessions/[id]/messages/route.ts`
- `app/api/sessions/[id]/generate-title/route.ts`

---

## Task 5: Frontend Integration

**Goal:** Update frontend to use new local API routes.

### Subtasks
- [ ] 5.1 Update `hooks/useChat.ts` to POST to `/api/chat`
- [ ] 5.2 Update `lib/api.ts` session endpoints to use local routes
- [ ] 5.3 Verify `onData` callback still receives sources
- [ ] 5.4 Verify `sourcesMap` populates correctly
- [ ] 5.5 Test citation clicks navigate correctly
- [ ] 5.6 Test session create/list/delete flow

### Changes Required
```typescript
// hooks/useChat.ts
// Change:
const apiUrl = `${API_BASE}/agent/chat`;
// To:
const apiUrl = `/api/chat`;

// lib/api.ts
// Change session endpoints from external to local:
// sessions.list: /api/sessions
// sessions.create: /api/sessions
// sessions.getMessages: /api/sessions/[id]/messages
// sessions.delete: /api/sessions/[id]
// sessions.generateTitle: /api/sessions/[id]/generate-title
```

### Deliverables
- Updated `hooks/useChat.ts`
- Updated `lib/api.ts`

---

## Task 6: Integration Testing & Validation

**Goal:** End-to-end validation and feature parity with Python backend.

### Subtasks - Automated
- [ ] 6.1 Run full test suite (`pnpm test:run`)
- [ ] 6.2 Verify all tests pass
- [ ] 6.3 Check test coverage report

### Subtasks - Manual E2E Testing
- [ ] 6.4 Test basic chat without RAG (general questions)
- [ ] 6.5 Test RAG search triggers on course-related questions
- [ ] 6.6 Test citation numbers match source content
- [ ] 6.7 Test session persists across page refresh
- [ ] 6.8 Test switching between sessions
- [ ] 6.9 Test deleting sessions
- [ ] 6.10 Compare response quality with Python backend (same queries)
- [ ] 6.11 Performance check: time to first token

### Manual Test Cases
1. **New session flow:** Create → Send message → Citations appear → Refresh → Messages reload
2. **Citation accuracy:** Ask about slide content → Click citation → PDF opens at correct page
3. **Lecture citation:** Ask about lecture → Click citation → Video seeks to timestamp
4. **Session list:** Multiple sessions → Correct order → Titles displayed
5. **Delete session:** Delete → Confirm gone → Messages gone

### Deliverables
- All automated tests passing
- Manual test results documented
- Any bugs filed and fixed

---

## Execution Order

```
Task 1 (Project Setup: Drizzle + Vitest)
    ↓
Task 2 (Core Infrastructure + unit tests)
    ↓
    ├── Task 3 (Chat API) ──────┐
    │                           │ (parallel possible)
    └── Task 4 (Session APIs) ──┘
            ↓
    Task 5 (Frontend Integration)
            ↓
    Task 6 (Integration Testing & Validation)
```

Tasks 3 and 4 can run in parallel after Task 2 completes.
Unit tests written alongside implementation in Tasks 2-4.

---

## Definition of Done

Phase 1 is complete when:
- [x] All 6 tasks marked complete
- [x] Chat works end-to-end with streaming
- [x] Citations display and link correctly
- [x] Sessions persist and reload
- [x] No calls to Python backend for chat/sessions
- [x] Agno not imported anywhere in new code
