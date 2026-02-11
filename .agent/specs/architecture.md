# Frontend Architecture

**Status:** Accepted

## Overview

StudyBuddy Frontend is a Next.js 16 application that provides a chat interface for RAG-based study assistance, document upload, and course management. It connects to a FastAPI backend for AI-powered question answering based on lecture recordings and PDF documents.

## Technology Stack

- **Next.js 16** with App Router and Turbopack
- **React 19** with Server Components
- **Tailwind CSS v4** with `@import "tailwindcss"` syntax
- **Clerk** for authentication
- **Radix UI** primitives with shadcn/ui components
- **Vercel AI SDK v6** for streaming chat

## Project Structure

```
app/                      # Next.js App Router
  ├── layout.tsx         # Root layout with ClerkProvider
  ├── page.tsx           # Home page (StudyBuddyClient)
  ├── globals.css        # Global styles, theme variables
  ├── sign-in/           # Clerk auth pages
  └── sign-up/
components/
  ├── StudyBuddyClient.tsx   # Main app orchestrator (all state)
  ├── Sidebar/               # Course dropdown, session list, theme toggle
  ├── MainContent/           # Chat messages, input, upload
  ├── RightPanel/            # PDF/video viewers (resizable)
  ├── Dialogs/               # Course select, materials management
  └── ui/                    # shadcn/ui component library
hooks/                    # Custom React hooks
lib/
  ├── api.ts             # Backend API client with Clerk auth
  └── utils.ts           # Utilities (cn())
types/index.ts           # TypeScript types
constants/colors.ts      # Dark/light color schemes
proxy.ts                 # Clerk middleware (route protection)
```

## Architecture Patterns

### State Management
- **Centralized orchestration**: `StudyBuddyClient` holds all state
- **Custom hooks**: Domain logic encapsulated in hooks (useCourses, useChat, etc.)
- **Props drilling**: State passed down to presentational components
- **No global state library**: React hooks + context is sufficient

### Component Structure
- **Container/Presenter pattern**: `StudyBuddyClient` manages state, child components render UI
- **Compound components**: Sidebar, MainContent, RightPanel composed into layout
- **Atomic UI components**: Reusable primitives in `components/ui/`

### Data Flow
```
User Action
    ↓
Component Event Handler
    ↓
Custom Hook (useCourses, useChat, etc.)
    ↓
API Client (lib/api.ts) with Clerk JWT
    ↓
FastAPI Backend
```

## Core Components

### StudyBuddyClient
Main application container that orchestrates:
- Course selection and management
- Chat session state
- Document uploads
- Theme toggling
- Panel resizing

### Sidebar
Left panel (280px expanded, 60px collapsed) containing:
- Course dropdown with add/remove functionality
- Chat sessions list
- New chat button
- Dark/light mode toggle

### MainContent
Center chat area with:
- Message display (user/assistant)
- Streaming text animation
- Citation rendering with clickable references
- Textarea input with keyboard shortcuts
- File upload drag-and-drop overlay
- Upload progress tracking

### RightPanel
Resizable right panel (mouse drag) with:
- Slides section (PDF viewer)
- Video section (lecture player)
- Collapsible sections

## Authentication Flow

```
User Request
    ↓
proxy.ts (clerkMiddleware)
    ↓
Authenticated? ──No──> Redirect to /sign-in
    ↓ Yes
Protected Route
```

- Public routes: `/sign-in`, `/sign-up`, `/api/webhook`
- All other routes require authentication
- ClerkProvider wraps app in `layout.tsx`
- API calls include JWT in Authorization header

## Backend Integration

API client in `lib/api.ts` provides type-safe methods for:
- Course management (list, add to user, remove)
- Document operations (upload, list, delete)
- Chat sessions (CRUD, messages, title generation)

All requests include `Authorization: Bearer <clerk-jwt>` header.

## Related Specs
- [Authentication](./authentication.md)
- [Markdown Rendering](./markdown-rendering.md)
- [Streaming Performance](./streaming-performance.md)
