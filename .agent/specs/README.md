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

*Last updated: 2026-02-11*

| Spec | Description | Key Topics |
|------|-------------|------------|
| **Migration (historical)** | | |
| [migration/00-overview.md](./migration/00-overview.md) | Backend migration plan | Python → Next.js/TypeScript, AI SDK, OpenRouter BYOK |
| [migration/02-openrouter-byok.md](./migration/02-openrouter-byok.md) | Phase 2: BYOK implementation | OAuth PKCE, encrypted key storage, user API keys |
| [migration/03-document-pipeline.md](./migration/03-document-pipeline.md) | Phase 3: Document pipeline | PDF upload, Gemini extraction, parallel processing, deduplication |
| [migration/04-lecture-pipeline.md](./migration/04-lecture-pipeline.md) | Phase 4: Lecture pipeline | RunPod transcription, semantic chunking, LLM topic detection |
| [migration/05-courses.md](./migration/05-courses.md) | Phase 5: Courses | CDCS sync, course enrollment, cron job |
| **Current** | | |
| [architecture.md](./architecture.md) | Frontend architecture | Next.js App Router, 3-column layout, state management |
| [authentication.md](./authentication.md) | Clerk integration | Auth flow, proxy.ts, protected routes |
| [markdown-rendering.md](./markdown-rendering.md) | AI markdown rendering | Streamdown, citations, code highlighting, streaming |
| [streaming-performance.md](./streaming-performance.md) | Streaming performance | Input isolation, token caching, Shiki optimization |
| [source-saving-pipeline.md](./source-saving-pipeline.md) | Source saving pipeline (end-to-end) | RAG sources, dedup persistence, fragility points, testing checklist |
| [lecture-citations.md](./lecture-citations.md) | Lecture citation links | Sources in stream, clickable timestamps, video navigation |
| [resilient-chat-requests.md](./resilient-chat-requests.md) | Resilient chat requests | Background jobs, pending messages, disconnect handling |
| [context-compaction.md](./context-compaction.md) | Context window compaction | Token tracking, conversation summarization, pruneMessages |
| [e2e-testing.md](./e2e-testing.md) | E2E testing setup | Playwright, Clerk auth, test patterns |
| [audio-channel-detection.md](./audio-channel-detection.md) | Audio channel detection for lectures | SDI stereo probe, channel selection, Whisper hallucination fix |
| [security-audit.md](./security-audit.md) | Security audit report | SQL injection, SSRF, auth bypass, file security, remediation |
| **Superseded** | | |
| [message-sources-persistence.md](./message-sources-persistence.md) | ~~Superseded by source-saving-pipeline.md~~ | Load sources with messages, historical context |
| [citation-debugging.md](./citation-debugging.md) | ~~Superseded by source-saving-pipeline.md~~ | Source flow, failure points, debugging steps |

---

## Adding New Specs

When adding a new spec:

1. Identify the **topic of concern** (one topic per spec)
2. Create `specs/{topic-name}.md`
3. Include `**Status:** Accepted` at the top
4. Add to the lookup table above
5. Link from related specs if needed
