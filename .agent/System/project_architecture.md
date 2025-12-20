# StudyBuddy Frontend - Project Architecture

## Project Goal

StudyBuddy is an AI-powered study assistant that helps students learn from lecture recordings and PDF documents. The frontend provides a chat interface for RAG-based conversations, document upload, and lecture video/slide viewing.

## Tech Stack

| Layer | Technology | Version |
|-------|------------|---------|
| Framework | Next.js | 16.0.10 |
| React | React | 19.2.1 |
| Language | TypeScript | 5.x |
| Styling | Tailwind CSS | 4.x |
| UI Components | Radix UI + shadcn/ui | Various |
| Authentication | Clerk | 6.36.4 |
| Build Tool | Turbopack | (built-in) |

## Project Structure

```
studybuddy-frontend/
├── app/                          # Next.js App Router
│   ├── layout.tsx               # Root layout with ClerkProvider + Toaster
│   ├── page.tsx                 # Home page (renders StudyBuddyClient)
│   ├── globals.css              # Global styles, theme variables, animations
│   ├── sign-in/[[...sign-in]]/  # Clerk sign-in page
│   └── sign-up/[[...sign-up]]/  # Clerk sign-up page
├── components/
│   ├── StudyBuddyClient.tsx     # Main app container (orchestrates all state)
│   ├── Sidebar/                 # Left sidebar
│   │   ├── Sidebar.tsx          # Course info, theme toggle, collapse controls
│   │   └── CourseDropdown.tsx   # Course switcher dropdown
│   ├── MainContent/             # Center chat area
│   │   └── MainContent.tsx      # Chat messages, input, drag-and-drop upload
│   ├── RightPanel/              # Right panel for materials
│   │   ├── RightPanel.tsx       # Resizable container
│   │   ├── SlidesSection.tsx    # PDF viewer placeholder
│   │   └── VideoSection.tsx     # Video player placeholder
│   ├── Chat/
│   │   └── AnimatedText.tsx     # Typing animation for AI responses
│   ├── Dialogs/
│   │   ├── CourseSelectDialog.tsx  # Command palette for course selection
│   │   └── MaterialsDialog.tsx     # Manage uploaded documents
│   ├── EmptyState/
│   │   └── EmptyState.tsx       # Shown when no courses selected
│   └── ui/                      # Radix-based UI component library
│       ├── button.tsx           # Button with variants (cva)
│       ├── command.tsx          # Command palette (cmdk)
│       ├── dialog.tsx           # Modal dialog
│       ├── dropdown-menu.tsx    # Dropdown menu
│       ├── scroll-area.tsx      # Custom scrollbar
│       ├── textarea.tsx         # Multiline text input
│       ├── toast.tsx            # Toast notification
│       └── toaster.tsx          # Toast container
├── hooks/
│   ├── useCourses.ts            # Course management with API integration
│   ├── useDocuments.ts          # Document fetching for current course
│   ├── useDocumentUpload.ts     # File upload with progress tracking
│   ├── useChat.ts               # Chat messages state management
│   ├── useResizePanel.ts        # Panel resize logic
│   └── use-toast.ts             # Toast state management
├── lib/
│   ├── api.ts                   # API client with Clerk auth
│   └── utils.ts                 # cn() utility for class merging
├── types/
│   └── index.ts                 # Shared TypeScript types
├── constants/
│   └── colors.ts                # Dark/light mode color schemes
├── proxy.ts                     # Clerk auth proxy (route protection)
└── .env.local                   # Environment variables (not committed)
```

## Authentication Flow

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────┐
│  User Request   │────▶│   proxy.ts   │────▶│  Protected  │
│                 │     │ (Clerk auth) │     │    Route    │
└─────────────────┘     └──────────────┘     └─────────────┘
                               │
                               ▼ (if unauthenticated)
                        ┌──────────────┐
                        │   /sign-in   │
                        └──────────────┘
```

**Key Points:**
- `proxy.ts` uses `clerkMiddleware` (Next.js 16 convention, replaces deprecated `middleware.ts`)
- Public routes: `/sign-in`, `/sign-up`, `/api/webhook`
- All other routes require authentication
- `ClerkProvider` wraps the entire app in `layout.tsx`

## Application Layout

```
┌──────────────────────────────────────────────────────────────────┐
│                         StudyBuddyClient                          │
├────────────┬─────────────────────────────┬───────────────────────┤
│  Sidebar   │        MainContent          │     RightPanel        │
│ (280/60px) │       (flex-1)              │    (resizable)        │
├────────────┼─────────────────────────────┼───────────────────────┤
│ Course     │  Header (StudyBuddy)        │ Slides Section        │
│ Dropdown   │                             │ (PDF viewer)          │
│            │  Chat Messages              │                       │
│ Course     │  (ScrollArea)               ├───────────────────────┤
│ Info       │                             │ Video Section         │
│            │  Upload Progress            │ (Video player)        │
│ Dark/Light │                             │                       │
│ Toggle     │  Message Input              │ Upload Button         │
│            │  (Textarea + Send)          │                       │
└────────────┴─────────────────────────────┴───────────────────────┘
```

## Styling System

### Tailwind CSS v4 Configuration

Uses the new `@import "tailwindcss"` syntax with `@theme inline` for custom properties:

```css
@import "tailwindcss";
@plugin "tailwindcss-animate";

@theme inline {
  --color-background: hsl(var(--background));
  --color-primary: hsl(var(--primary));
  /* ... */
}
```

### Theme Variables (HSL format)

Defined in `globals.css` with light/dark mode support:
- Light mode: `:root { ... }`
- Dark mode: `.dark { ... }`

### Color Schemes (Hex format)

For programmatic use in `constants/colors.ts`:
- `darkModeColors`: Dark blue theme (#1a1f2e background, #7dd3fc accent)
- `lightModeColors`: Warm beige theme (#f5f1e8 background, #a67c52 accent)

### Component Variants

Using `class-variance-authority` (cva) for variant-based styling:

```tsx
const buttonVariants = cva("base-classes", {
  variants: {
    variant: { default: "...", destructive: "...", ghost: "..." },
    size: { default: "...", sm: "...", lg: "...", icon: "..." }
  }
});
```

## Core Types

```typescript
// types/index.ts

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  isTyping?: boolean;
};

// Matches backend CourseResponse schema
type Course = {
  id: string;
  code: string;        // e.g., "CSC 242"
  title: string;       // e.g., "Introduction to AI"
  instructor: string | null;
};

// Document from backend
type Document = {
  id: string;
  course_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  page_count: number | null;
  status: "uploaded" | "failed";
  created_at: string;
  updated_at: string;
};

type ColorScheme = {
  background: string;
  panel: string;
  card: string;
  border: string;
  primaryText: string;
  secondaryText: string;
  accent: string;
  accentHover: string;
  hover: string;
  selected: string;
  buttonIcon: string;
};
```

## Custom Hooks

| Hook | Purpose | Key Features |
|------|---------|--------------|
| `useCourses` | Course management | Fetches all courses, user's courses; add/remove courses via API |
| `useDocuments` | Document listing | Fetches documents for current course; delete document |
| `useDocumentUpload` | File upload | Drag-and-drop, progress tracking, upload to backend |
| `useChat` | Chat state | Messages, input value, send message, delete history |
| `useResizePanel` | Panel resizing | Mouse drag to resize right panel |
| `use-toast` | Notifications | Toast state management |

## API Layer (lib/api.ts)

Centralized API client with Clerk authentication:

```typescript
export const api = {
  courses: {
    listAll: (token) => ...,           // GET /api/courses
    listUserCourses: (token) => ...,   // GET /api/user/courses
    addToUser: (token, courseId) => ..., // POST /api/user/courses/{id}
    removeFromUser: (token, courseId) => ..., // DELETE /api/user/courses/{id}
  },
  documents: {
    listByCourse: (token, courseId) => ..., // GET /api/courses/{id}/documents
    upload: (token, courseId, file, onProgress) => ..., // POST /api/documents/upload
    get: (token, documentId) => ...,   // GET /api/documents/{id}
    delete: (token, documentId) => ..., // DELETE /api/documents/{id}
  },
};
```

**Authentication:** All API calls require Clerk JWT in `Authorization: Bearer <token>` header.

## Backend Integration Points

The frontend connects to a FastAPI backend at `NEXT_PUBLIC_API_URL`:

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/courses` | GET | List all available courses (official CDCS catalog) |
| `/api/user/courses` | GET | List user's selected courses |
| `/api/user/courses/{id}` | POST | Add course to user's list |
| `/api/user/courses/{id}` | DELETE | Remove course from user's list |
| `/api/courses/{id}/documents` | GET | List documents for a course |
| `/api/documents/upload` | POST | Upload PDF document |
| `/api/documents/{id}` | GET | Get document details |
| `/api/documents/{id}` | DELETE | Delete document |
| `/api/agent/chat` | POST | Streaming RAG chat (SSE) |
| `/api/lectures/download` | POST | Panopto lecture download |

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk frontend key |
| `CLERK_SECRET_KEY` | Clerk backend key |
| `NEXT_PUBLIC_CLERK_SIGN_IN_URL` | Sign-in route (`/sign-in`) |
| `NEXT_PUBLIC_CLERK_SIGN_UP_URL` | Sign-up route (`/sign-up`) |
| `NEXT_PUBLIC_API_URL` | Backend API base URL |

## Development Status

**Completed:**
- Phase 1 & 2: Project setup, UI components, Clerk auth
- Phase 3: 3-column layout (Sidebar, MainContent, RightPanel)
- Phase 4: Course management, document upload with backend API integration

**Pending:**
- Chat interface with SSE streaming (backend integration)
- PDF viewer integration
- Video player for lectures
- Lecture download from Panopto

---

**Related Docs:**
- [README.md](../README.md) - Documentation index
