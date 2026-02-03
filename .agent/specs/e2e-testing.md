# E2E Testing with Playwright and Clerk

**Status:** Accepted
**Last Updated:** 2026-02-03

## Overview

This spec documents the E2E testing setup using Playwright with Clerk authentication for StudyBuddy.

## Technology Stack

- **Playwright** - Browser automation and E2E testing
- **@clerk/testing** - Clerk's official testing helpers for Playwright
- **Test Email Format** - `email+clerk_test@example.com` with verification code `424242`

## Directory Structure

```
e2e/
├── playwright.config.ts    # Playwright configuration
├── global.setup.ts         # Clerk auth setup (runs before tests)
├── .clerk/                  # Auth state storage (gitignored)
│   └── user.json           # Stored authenticated session
└── tests/
    ├── api-routes.spec.ts      # API endpoint tests (unauthenticated)
    ├── auth-flow.spec.ts       # Authentication flow tests (unauthenticated)
    ├── openrouter-byok.spec.ts # OpenRouter BYOK tests (authenticated)
    ├── chat-rag.spec.ts        # Chat functionality tests (authenticated)
    ├── chat-frontend-integration.spec.ts  # Chat UI tests (authenticated)
    └── session-management.spec.ts  # Session CRUD tests (authenticated)
```

## Authentication Setup

### Environment Variables Required

```bash
# .env.local
E2E_CLERK_USER_EMAIL=your_email+clerk_test@example.com
E2E_CLERK_VERIFICATION_CODE=424242
CLERK_SECRET_KEY=sk_test_...  # Required for clerk.signIn()
```

### Global Setup (global.setup.ts)

Uses `@clerk/testing/playwright` helpers:

```typescript
import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';

setup('global setup', async ({}) => {
  await clerkSetup();
});

setup('authenticate', async ({ page }) => {
  await page.goto('/sign-in');
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'email_code',
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
    },
  });
  await page.context().storageState({ path: 'e2e/.clerk/user.json' });
});
```

### Test Configuration

Projects are organized by authentication state:

1. **global setup** - Runs first, authenticates user
2. **unauthenticated** - Tests that don't need auth (API routes, auth flow)
3. **authenticated** - Tests that use stored auth state (chat, sessions, OpenRouter BYOK)

#### Why Authenticated vs Unauthenticated Matters

Clerk middleware (`proxy.ts`) intercepts all requests to protected routes. For unauthenticated requests, Clerk returns an HTML sign-in page (200 status) **before** the route handler executes. This means:

- **Unauthenticated tests** can only verify routes exist (not 404) and Clerk protects them
- **Authenticated tests** can test actual route behavior, JSON responses, and business logic

For API routes that need meaningful testing (like OpenRouter BYOK), use the authenticated project so requests reach the actual route handlers.

## Test Categories

### 1. API Route Tests (unauthenticated)
- Verify all API routes exist and respond
- Check response formats

### 2. Auth Flow Tests (unauthenticated)
- Verify redirect to sign-in when not authenticated
- Test sign-in/sign-up pages load correctly

### 3. Authenticated Tests
Tests that require a logged-in user:
- App loads without redirecting to sign-in
- Empty state displays correctly
- Theme toggle works

### 4. OpenRouter BYOK Tests (authenticated)
Tests for the Bring Your Own Key OAuth flow:
- **Status endpoint** - Returns `{ connected: false, usingSharedKey: true }` for users without a connected key
- **Connect endpoint** - Redirects to OpenRouter OAuth with PKCE parameters (code_challenge, S256 method)
- **Disconnect endpoint** - Returns `{ success: true }` (idempotent)
- **Callback endpoint** - Handles error cases (no code, missing verifier)
- **PKCE validation** - Verifies secure cookie attributes and unique code verifiers

Note: Full OAuth flow (actually connecting a key) requires manual testing against real OpenRouter.

### 5. Tests Requiring Backend Data (skipped)
These tests are skipped until the test user has courses:
- Chat input visibility
- Session list in sidebar
- Message sending
- RAG/citation features

## Running Tests

```bash
# Run all E2E tests
pnpm test:e2e

# Run with Playwright UI
pnpm test:e2e:ui

# Run specific test file
npx playwright test e2e/tests/auth-flow.spec.ts --config=e2e/playwright.config.ts
```

## Test User Setup

For full chat tests to pass, the test user needs:

1. **At least one course added** - Tests check for chat input which only appears with courses
2. **Course materials uploaded** - For RAG/citation tests

Without this setup, chat interface tests will be skipped.

## Key Patterns

### Clerk Test Mode
- Use email format: `+clerk_test` suffix (e.g., `user+clerk_test@example.com`)
- Verification code is always `424242` in test mode
- Requires `CLERK_SECRET_KEY` environment variable

### Auth State Storage
- Auth state saved to `e2e/.clerk/user.json`
- Reused across all authenticated tests
- Gitignored to prevent committing session data

### Handling Empty State
Tests should handle the case where user has no courses:
```typescript
// Check for empty state OR full app
const hasEmptyState = await page.locator('text=Add Your First Course').isVisible();
const hasChatInput = await page.locator('textarea').isVisible();
expect(hasEmptyState || hasChatInput).toBe(true);
```

## Common Issues

### "Error reading storage state"
The global setup didn't run. Ensure:
- `testDir: '.'` is set for global setup project
- `dependencies: ['global setup']` is set for other projects

### Tests timeout on sign-in
Check that Clerk test credentials are correct and `CLERK_SECRET_KEY` is set.

### Chat tests fail
The test user likely has no courses. Either:
1. Skip these tests with `test.skip()`
2. Set up the test user with courses in the database

## References

- [Clerk Testing Documentation](https://clerk.com/docs/testing/playwright)
- [Playwright Authentication](https://playwright.dev/docs/auth)
- [Clerk Test Mode](https://clerk.com/docs/testing/test-emails-and-phones)
