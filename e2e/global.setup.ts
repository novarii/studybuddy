import { clerkSetup, clerk } from '@clerk/testing/playwright';
import { test as setup } from '@playwright/test';
import path from 'path';

// Setup must be run serially
setup.describe.configure({ mode: 'serial' });

// Configure Playwright with Clerk
setup('global setup', async ({}) => {
  await clerkSetup();
});

// Define the path to the storage file
const authFile = path.join(__dirname, '.clerk/user.json');

setup('authenticate and save state to storage', async ({ page }) => {
  // Navigate to an unprotected page that loads Clerk
  await page.goto('/sign-in');

  // Sign in using Clerk's test helper with email code strategy
  // Uses test email format: email+clerk_test@example.com with code 424242
  await clerk.signIn({
    page,
    signInParams: {
      strategy: 'email_code',
      identifier: process.env.E2E_CLERK_USER_EMAIL!,
    },
  });

  // Navigate to protected page to verify auth works
  await page.goto('/');

  // Wait for the app to load (should not redirect to sign-in)
  await page.waitForTimeout(3000);

  // Verify we're authenticated by checking we're NOT on sign-in page
  const url = page.url();
  if (url.includes('sign-in')) {
    throw new Error('Authentication failed - still on sign-in page');
  }

  // Save the authenticated state
  await page.context().storageState({ path: authFile });
});
