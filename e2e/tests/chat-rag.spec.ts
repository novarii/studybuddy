import { test, expect } from '@playwright/test';

/**
 * Chat and RAG E2E Tests
 *
 * These tests run with authenticated state from global setup.
 * Note: Chat interface tests require a user with courses.
 * Tests are organized by what can run without backend data setup.
 */

test.describe('Chat - Authenticated User', () => {
  test('authenticated user sees app (not sign-in)', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should NOT be on sign-in page
    expect(page.url()).not.toContain('sign-in');
  });

  test('app header shows StudyBuddy', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const header = page.locator('text=StudyBuddy').first();
    await expect(header).toBeVisible({ timeout: 10000 });
  });

  test('empty state shows feature descriptions', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Check for feature descriptions in empty state
    const features = [
      'Upload Materials',
      'AI-Powered Learning',
      'Add Your First Course',
    ];

    let foundFeature = false;
    for (const feature of features) {
      if (await page.locator(`text=${feature}`).isVisible().catch(() => false)) {
        foundFeature = true;
        break;
      }
    }

    // Either shows features (empty state) or has chat (user has courses)
    expect(foundFeature || await page.locator('textarea').isVisible().catch(() => false)).toBe(true);
  });
});

// Tests that require the user to have courses set up
test.describe('Chat Interface (requires courses)', () => {
  test.skip('chat input is visible', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await expect(textarea).toBeVisible({ timeout: 10000 });
  });

  test.skip('chat input has placeholder text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    const placeholder = await textarea.getAttribute('placeholder');
    expect(placeholder).toMatch(/ask|question|lecture|problem/i);
  });

  test.skip('can type in chat input', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await textarea.fill('Test message');
    expect(await textarea.inputValue()).toBe('Test message');
  });

  test.skip('send button is disabled when empty', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await textarea.fill('');
    const sendButton = page.locator('button.rounded-full').last();
    await expect(sendButton).toBeDisabled();
  });

  test.skip('send button is enabled with text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await textarea.fill('Hello');
    const sendButton = page.locator('button.rounded-full').last();
    await expect(sendButton).toBeEnabled();
  });

  test.skip('Shift+Enter adds newline', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await textarea.fill('Line 1');
    await textarea.press('Shift+Enter');
    await textarea.type('Line 2');
    const value = await textarea.inputValue();
    expect(value).toContain('\n');
  });

  test.skip('Enter sends message', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    const textarea = page.locator('textarea').first();
    await textarea.fill('Test message');
    await textarea.press('Enter');
    await page.waitForTimeout(1000);
    // Input should be cleared after send
    expect(await textarea.inputValue()).toBe('');
  });
});

// RAG-specific tests (require courses AND uploaded materials)
test.describe('RAG Features (requires courses + materials)', () => {
  test.skip('streaming response shows loading indicator', async ({ page }) => {
    // Requires sending a message and observing response
    await page.goto('/');
  });

  test.skip('citations render correctly', async ({ page }) => {
    // Requires messages with citation data
    await page.goto('/');
  });

  test.skip('clicking citation navigates to source', async ({ page }) => {
    // Requires course materials to be uploaded
    await page.goto('/');
  });
});
