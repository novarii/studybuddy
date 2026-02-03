import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for StudyBuddy E2E tests
 * Uses Clerk testing helpers for authentication
 *
 * @see https://playwright.dev/docs/test-configuration
 * @see https://clerk.com/docs/testing/playwright
 */
export default defineConfig({
  testDir: './tests',
  /* Run tests in files in parallel */
  fullyParallel: true,
  /* Fail the build on CI if you accidentally left test.only in the source code. */
  forbidOnly: !!process.env.CI,
  /* Retry on CI only */
  retries: process.env.CI ? 2 : 0,
  /* Opt out of parallel tests on CI. */
  workers: process.env.CI ? 1 : undefined,
  /* Reporter to use. See https://playwright.dev/docs/test-reporters */
  reporter: [['html', { open: 'never' }], ['list']],
  /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
  use: {
    /* Base URL to use in actions like `await page.goto('/')`. */
    baseURL: process.env.BASE_URL || 'http://localhost:3000',

    /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
    trace: 'on-first-retry',

    /* Screenshot on failure */
    screenshot: 'only-on-failure',
  },

  /* Configure projects */
  projects: [
    // Global setup - runs once before all tests
    {
      name: 'global setup',
      testDir: '.',
      testMatch: /global\.setup\.ts/,
    },

    // Unauthenticated tests (API routes, auth flow)
    {
      name: 'unauthenticated',
      testMatch: /\/(api-routes|auth-flow)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Clear all auth state to ensure truly unauthenticated requests
        storageState: { cookies: [], origins: [] },
      },
      dependencies: ['global setup'],
    },

    // Authenticated tests (chat, sessions, OpenRouter BYOK) - use stored auth state
    {
      name: 'authenticated',
      testMatch: /\/(chat-rag|session-management|chat-frontend-integration|openrouter-byok)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        // Use prepared Clerk auth state
        storageState: 'e2e/.clerk/user.json',
      },
      dependencies: ['global setup'],
    },
  ],

  /* Run your local dev server before starting the tests */
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
