# Specs Directory

This directory contains specification documents for StudyBuddy Frontend, following spec-driven development principles.

## What is a Spec?

A **spec** is an atomic source of truth document. It can contain:
- Requirements and constraints
- Architecture decisions and rationale
- Code patterns and guidelines
- Implementation standards

**Key principles:**
- 1 topic of concern = 1 spec file
- Specs are referenced by implementation tasks
- Implementation plans should be self-contained (reference specs or include all needed info)

---

## Spec Lookup Table

*Last updated: 2026-02-04*

| Spec | Description | Key Topics |
|------|-------------|------------|
| [migration/00-overview.md](./migration/00-overview.md) | Backend migration plan | Python → Next.js/TypeScript, AI SDK, OpenRouter BYOK |
| [migration/02-openrouter-byok.md](./migration/02-openrouter-byok.md) | Phase 2: BYOK implementation | OAuth PKCE, encrypted key storage, user API keys |
| [migration/03-document-pipeline.md](./migration/03-document-pipeline.md) | Phase 3: Document pipeline | PDF upload, Gemini extraction, parallel processing, deduplication |
| [migration/04-lecture-pipeline.md](./migration/04-lecture-pipeline.md) | Phase 4: Lecture pipeline | RunPod transcription, semantic chunking, LLM topic detection |
| [migration/05-courses.md](./migration/05-courses.md) | Phase 5: Courses | CDCS sync, course enrollment, cron job |
| [architecture.md](./architecture.md) | Frontend architecture | Next.js App Router, 3-column layout, state management |
| [tech-stack.md](./tech-stack.md) | Technology choices | Next.js 16, React 19, Tailwind v4, Clerk |
| [ui-component-library.md](./ui-component-library.md) | UI component system | shadcn/ui, Radix primitives, cva variants |
| [theme-system.md](./theme-system.md) | Theming and styling | Dark/light modes, color tokens, Tailwind v4 |
| [authentication.md](./authentication.md) | Clerk integration | Auth flow, proxy.ts, protected routes |
| [chat-streaming.md](./chat-streaming.md) | AI SDK integration | Vercel AI SDK v6, SSE streaming, citations |
| [session-management.md](./session-management.md) | Chat session UI | Session list, CRUD, auto-titling |
| [backend-integration.md](./backend-integration.md) | API client | FastAPI integration, error handling, types |
| [layout-system.md](./layout-system.md) | 3-column layout | Sidebar, MainContent, RightPanel, resizing |
| [markdown-rendering.md](./markdown-rendering.md) | AI markdown rendering | Streamdown, citations, code highlighting, streaming |
| [message-sources-persistence.md](./message-sources-persistence.md) | RAG sources persistence | Load sources with messages, historical citations |
| [e2e-testing.md](./e2e-testing.md) | E2E testing setup | Playwright, Clerk auth, test patterns |
| [lecture-citations.md](./lecture-citations.md) | Lecture citation links | Sources in stream, clickable timestamps, video navigation |
| [streaming-performance.md](./streaming-performance.md) | Streaming performance | Input isolation, token caching, Shiki optimization |
| [citation-debugging.md](./citation-debugging.md) | Citation debugging guide | Source flow, failure points, debugging steps |
| [resilient-chat-requests.md](./resilient-chat-requests.md) | Resilient chat requests | Background jobs, pending messages, disconnect handling |
| [audio-channel-detection.md](./audio-channel-detection.md) | Audio channel detection for lectures | SDI stereo probe, channel selection, Whisper hallucination fix |

---

## Adding New Specs

When adding a new spec:

1. Identify the **topic of concern** (one topic per spec)
2. Create `specs/{topic-name}.md`
3. Include `**Status:** Accepted` at the top
4. Add to the lookup table above
5. Link from related specs if needed
