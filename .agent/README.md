# StudyBuddy Frontend - Documentation Index

This directory contains all critical documentation for engineers working on the StudyBuddy frontend.

## Quick Start

```bash
pnpm install          # Install dependencies
pnpm dev              # Start dev server at http://localhost:3000
pnpm build            # Production build
pnpm lint             # Run ESLint
```

**Prerequisites:** Copy `.env.example` to `.env.local` and add your Clerk keys and API URL.

---

## Documentation Structure

### System (Architecture & Design)

| Document | Description |
|----------|-------------|
| [project_architecture.md](./System/project_architecture.md) | Tech stack, project structure, component hierarchy, hooks, API integration, types, and development status |

### Tasks (PRD & Implementation Plans)

| Document | Description |
|----------|-------------|
| [audit-cleanup-plan.md](./Tasks/audit-cleanup-plan.md) | Codebase audit and cleanup plan |

### SOP (Standard Operating Procedures)

*No SOPs documented yet. Add best practices for common tasks here.*

---

## Key Files Reference

| File | Purpose |
|------|---------|
| `proxy.ts` | Clerk auth route protection |
| `app/layout.tsx` | Root layout with ClerkProvider |
| `app/globals.css` | Theme variables and animations |
| `lib/api.ts` | Centralized API client with Clerk auth |
| `lib/utils.ts` | `cn()` class merging utility |
| `types/index.ts` | Shared TypeScript types (Course, Document, ChatMessage) |
| `constants/colors.ts` | Dark/light color schemes |
| `components/StudyBuddyClient.tsx` | Main app container |
| `components/ui/*` | Radix-based UI components |
| `hooks/*` | Custom React hooks (useCourses, useDocuments, useChat, etc.) |

---

## Component Hierarchy

```
StudyBuddyClient (orchestrates all state)
├── Sidebar (course selector, theme toggle)
├── MainContent (chat, file upload)
├── RightPanel (PDF viewer, video player)
├── CourseSelectDialog (add courses)
├── MaterialsDialog (manage documents)
└── EmptyState (no courses selected)
```

---

## Tech Stack Summary

- **Next.js 16** with App Router and Turbopack
- **React 19** with Server Components
- **Tailwind CSS v4** with `@import "tailwindcss"` syntax
- **Clerk** for authentication
- **Radix UI + shadcn/ui** for accessible components
- **cmdk** for command palette

---

## Backend Integration

The frontend connects to a FastAPI backend. Key endpoints:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/courses` | List all CDCS courses |
| `GET /api/user/courses` | User's selected courses |
| `POST /api/user/courses/{id}` | Add course |
| `DELETE /api/user/courses/{id}` | Remove course |
| `GET /api/courses/{id}/documents` | List documents |
| `POST /api/documents/upload` | Upload PDF |
| `DELETE /api/documents/{id}` | Delete document |
| `POST /api/agent/chat` | RAG chat (SSE) |

All API calls require Clerk JWT token in Authorization header.

---

## Development Status

**Completed (Phase 1-4):**
- Project setup, UI components, Clerk auth
- 3-column layout (Sidebar, MainContent, RightPanel)
- Course management with backend API
- Document upload with progress tracking

**Pending:**
- Chat interface with SSE streaming
- PDF viewer integration
- Video player for lectures
