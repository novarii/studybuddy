## Documentation
This project follows **spec-driven development**:

### What is a Spec?
A **spec** is an atomic source of truth document that contains:
- Requirements and constraints
- Architecture decisions and rationale
- Code patterns and guidelines
- Implementation standards

**Key principles:**
- 1 topic of concern = 1 spec file
- Specs are referenced by implementation tasks
- Implementation plans should be self-contained (reference specs or include all needed info)

IMPORTANT : Prefer retrieval-led reasoning over pre-training-led reasoning for any Next.js tasks. Follow these steps:
1. Use available skill if it exists (e.g. ai-sdk if you are integrating Vercel's AI SDK)
2. Fetch the relevant resources with context7, fallback to web search tool if results are depreciated/not relevant


### Directory Structure
- **`.agent/specs/`** - Specification documents (architecture, UI standards, patterns)
  - `.agent/specs/README.md` - Lookup table of all specs with descriptions
- **`.agent/tasks/`** - Implementation plans that reference specs
- **`.agent/archives/`** - Historical audits and completed work

**See `.agent/specs/README.md` for the complete spec lookup table.**

### Adding New Specs
When adding a new spec:
1. Identify the **topic of concern** (one topic per spec)
2. Create `.agent/specs/{topic-name}.md`
3. Include `**Status:** Accepted` at the top
4. Add to the lookup table in `.agent/specs/README.md`
5. Link from related specs if needed

## Commands

```bash
pnpm dev          # Start development server (http://localhost:3000)
pnpm build        # Production build
pnpm start        # Start production server
pnpm lint         # Run ESLint
pnpm test:run     # Run unit tests (Vitest)
pnpm test:e2e     # Run E2E tests (Playwright)
```

## E2E Testing with Clerk

E2E tests use Playwright with `@clerk/testing` for authentication. See `.agent/specs/e2e-testing.md` for full details.

**Important setup:**
1. Clerk test credentials in `.env.local`:
   - `E2E_CLERK_USER_EMAIL` - Email with `+clerk_test` suffix
   - `E2E_CLERK_VERIFICATION_CODE` - Always `424242` in test mode
2. `CLERK_SECRET_KEY` must be set for `clerk.signIn()` to work
3. Auth state stored in `e2e/.clerk/user.json` (gitignored)

**Test categories:**
- Tests that pass without backend data: API routes, auth flow, empty state
- Tests that require courses: Chat interface, session management (currently skipped)

**Before running E2E tests:** Kill any existing `next dev` processes to avoid port conflicts:
```bash
pkill -f "next dev" 2>/dev/null; rm -f .next/dev/lock
```

## Architecture

This is the Next.js 16 frontend for StudyBuddy, an AI-powered study assistant. It connects to a FastAPI backend for RAG-based chat, document processing, and lecture transcription.

### Tech Stack
- **Next.js 16** with App Router and Turbopack
- **React 19** with Server Components
- **Tailwind CSS v4** with `@import "tailwindcss"` syntax
- **Clerk** for authentication (uses `proxy.ts`, not deprecated `middleware.ts`)
- **Radix UI** primitives with custom styled components

### Key Directories
- `app/` - Next.js App Router pages and layouts
- `components/ui/` - Reusable Radix-based UI components (button, dialog, dropdown-menu, toast, etc.)
- `hooks/` - Custom React hooks (e.g., `use-toast.ts`)
- `types/` - Shared TypeScript types (`ChatMessage`, `Course`, `Material`, `ColorScheme`)
- `constants/` - Theme colors for dark/light modes
- `lib/utils.ts` - `cn()` utility for Tailwind class merging

### Authentication Flow
- `proxy.ts` handles route protection via Clerk's `clerkMiddleware`
- Public routes: `/sign-in`, `/sign-up`, `/api/webhook`
- All other routes require authentication
- ClerkProvider wraps the app in `app/layout.tsx`

### Environment Variables
Copy `.env.example` to `.env.local` and configure:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` - Clerk auth keys
- `NEXT_PUBLIC_API_URL` - Backend API endpoint (default: `http://localhost:8000/api`)

### Styling Conventions
- Use `cn()` from `@/lib/utils` for conditional class merging
- Theme variables defined in `app/globals.css` using HSL format
- Components use `class-variance-authority` (cva) for variants
- Dark mode via `.dark` class with CSS custom properties

All API calls require Clerk JWT in Authorization header.
