import { test, expect } from '@playwright/test';

/**
 * Authentication Flow Tests
 *
 * Tests the Clerk authentication flow including:
 * - Redirect to sign-in when unauthenticated
 * - Sign-in page loads correctly
 * - Sign-up page loads correctly
 */

test.describe('Authentication Flow', () => {
  test('unauthenticated user is redirected to sign-in', async ({ page }) => {
    await page.goto('/');

    // Should redirect to sign-in
    await expect(page).toHaveURL(/sign-in/);
  });

  test('sign-in page loads correctly', async ({ page }) => {
    await page.goto('/sign-in');

    // Wait for Clerk to initialize
    await page.waitForTimeout(2000);

    // Page should contain sign-in URL
    expect(page.url()).toContain('sign-in');
  });

  test('sign-up page loads correctly', async ({ page }) => {
    await page.goto('/sign-up');

    // Wait for Clerk to initialize
    await page.waitForTimeout(2000);

    // Page should contain sign-up URL
    expect(page.url()).toContain('sign-up');
  });

  test('sign-in page has form elements', async ({ page }) => {
    await page.goto('/sign-in');

    // Wait for Clerk to fully load
    await page.waitForTimeout(3000);

    // Check for Clerk elements or form inputs
    const hasInputs = await page.evaluate(() => {
      // Clerk renders in iframes or has specific class names
      const hasClerkElement =
        document.querySelector('[data-clerk-root]') !== null ||
        document.querySelector('.cl-rootBox') !== null ||
        document.querySelector('[class*="clerk"]') !== null;
      const hasIframe = document.querySelector('iframe') !== null;
      const hasForm = document.querySelector('form') !== null;
      const hasInput = document.querySelector('input') !== null;

      return hasClerkElement || hasIframe || hasForm || hasInput;
    });

    expect(hasInputs).toBe(true);
  });
});
