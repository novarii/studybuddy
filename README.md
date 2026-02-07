# StudyBuddy Frontend

AI-powered study assistant that helps students learn from their lecture recordings and course slides. Ask questions, get answers with citations, and navigate directly to the relevant lecture moment or slide.

## Tech Stack

- **Next.js 16** (App Router, Turbopack)
- **React 19** with Server Components
- **Tailwind CSS v4** + Radix UI primitives
- **Clerk** for authentication
- **Vercel AI SDK v6** for streaming chat
- **Drizzle ORM** with PostgreSQL
- **OpenRouter** (BYOK) for LLM access

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL database

### Setup

```bash
pnpm install
cp .env.example .env.local
```

Configure `.env.local` with:

- **Clerk** keys (`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`)
- **Database** URL (`DATABASE_URL=postgresql://...`)
- **Encryption key** for API key storage (`ENCRYPTION_KEY`)

### Database

```bash
pnpm db:generate   # Generate migration from schema changes
pnpm db:migrate    # Apply pending migrations
```

All tables live in the `ai` schema.

### Run

```bash
pnpm dev           # Development server (http://localhost:3000)
pnpm build         # Production build
pnpm start         # Production server
```

## Architecture

```
app/
  api/
    chat/          # Streaming chat with RAG tool calling
    sessions/      # Chat session CRUD
    courses/       # Course management + CDCS sync
    documents/     # PDF upload and processing
    lectures/      # Lecture transcription pipeline
    openrouter/    # BYOK key management + OAuth
    user/          # User preferences
    cron/          # Scheduled jobs (course sync)
  page.tsx         # Main app (single-page with 3-column layout)
components/
  Sidebar/         # Course selector, session list, theme toggle
  MainContent/     # Chat messages, input, citations
  RightPanel/      # PDF viewer, lecture video player
  Dialogs/         # Course selection, materials management
  ui/              # Reusable Radix-based components
lib/
  ai/              # Embeddings, retrieval, prompts, context compaction
  db/              # Drizzle schema + client
  sources/         # Citation deduplication and persistence
  api-keys.ts      # Encrypted BYOK key management
```

### How Chat Works

1. User sends a message
2. Server calls the LLM (DeepSeek V3.2 via OpenRouter) with a `search_course_materials` tool
3. LLM decides whether to search — if yes, RAG retrieves relevant slide chunks and lecture transcript segments via pgvector
4. LLM responds with citations (`[1]`, `[2]`, etc.) linking to specific slides or lecture timestamps
5. Response streams to the frontend; sources are saved for persistent citations
6. `consumeStream()` ensures all data persists even if the user navigates away mid-response

### Context Compaction

Long conversations are automatically compacted when prompt tokens exceed 131k. Older messages are summarized by the LLM and replaced with a summary in the context window. The full message history remains in the database and frontend — compaction only affects what the LLM sees.

## Testing

```bash
pnpm test:run      # Unit tests (Vitest)
pnpm test:e2e      # E2E tests (Playwright + Clerk)
pnpm lint          # ESLint
```

## Deployment

Deployed on **Railway**. Push to `main` triggers automatic deployment.

```bash
pnpm build         # Always build locally before pushing to catch errors
```

## Specs

This project follows spec-driven development. See [`.agent/specs/README.md`](.agent/specs/README.md) for the full spec lookup table.
