import { test, expect } from '@playwright/test';

/**
 * OpenRouter BYOK (Bring Your Own Key) E2E Tests
 *
 * These tests run authenticated and verify the actual route behavior.
 * They test the full stack including database operations and redirects.
 *
 * Test user state: No OpenRouter key connected (fresh user)
 *
 * Note: Full OAuth flow testing (connecting a real key) requires a real
 * OpenRouter account and is covered by manual testing (subtasks 5.9-5.11).
 */

test.describe('OpenRouter BYOK - Status Endpoint', () => {
  test('returns not connected status for user without key', async ({
    request,
  }) => {
    const response = await request.get('/api/openrouter/status');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const json = await response.json();
    expect(json).toEqual({
      connected: false,
      usingSharedKey: true,
    });
  });

  test('does not expose sensitive fields when not connected', async ({
    request,
  }) => {
    const response = await request.get('/api/openrouter/status');
    const json = await response.json();

    // Should not have these fields when not connected
    expect(json).not.toHaveProperty('keyLabel');
    expect(json).not.toHaveProperty('openrouterKeyEncrypted');
    expect(json).not.toHaveProperty('openrouterKeyHash');
  });
});

test.describe('OpenRouter BYOK - Connect Endpoint', () => {
  test('redirects to OpenRouter OAuth with PKCE parameters', async ({
    request,
  }) => {
    const response = await request.get('/api/openrouter/connect', {
      maxRedirects: 0, // Don't follow redirects
    });

    expect(response.status()).toBe(302);

    const location = response.headers()['location'];
    expect(location).toBeDefined();
    expect(location).toContain('openrouter.ai/auth');

    // Verify PKCE parameters are present
    const url = new URL(location!);
    expect(url.searchParams.get('code_challenge')).toBeTruthy();
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('callback_url')).toContain(
      '/api/openrouter/callback'
    );
  });

  test('sets secure cookie for code verifier', async ({ request }) => {
    const response = await request.get('/api/openrouter/connect', {
      maxRedirects: 0,
    });

    const setCookie = response.headers()['set-cookie'];
    expect(setCookie).toBeDefined();
    expect(setCookie).toContain('openrouter_verifier=');
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('Secure');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Max-Age=600');
  });

  test('generates unique code verifier on each request', async ({ request }) => {
    const response1 = await request.get('/api/openrouter/connect', {
      maxRedirects: 0,
    });
    const response2 = await request.get('/api/openrouter/connect', {
      maxRedirects: 0,
    });

    const location1 = response1.headers()['location'];
    const location2 = response2.headers()['location'];

    const challenge1 = new URL(location1!).searchParams.get('code_challenge');
    const challenge2 = new URL(location2!).searchParams.get('code_challenge');

    // Each request should generate a unique challenge
    expect(challenge1).not.toBe(challenge2);
  });
});

test.describe('OpenRouter BYOK - Disconnect Endpoint', () => {
  test('returns success even when no key exists (idempotent)', async ({
    request,
  }) => {
    const response = await request.delete('/api/openrouter/disconnect');

    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');

    const json = await response.json();
    expect(json).toEqual({ success: true });
  });

  test('status remains disconnected after disconnect', async ({ request }) => {
    // Disconnect (even though not connected)
    await request.delete('/api/openrouter/disconnect');

    // Verify status is still disconnected
    const statusResponse = await request.get('/api/openrouter/status');
    const json = await statusResponse.json();

    expect(json.connected).toBe(false);
    expect(json.usingSharedKey).toBe(true);
  });
});

test.describe('OpenRouter BYOK - Callback Endpoint', () => {
  test('redirects with error when no code provided', async ({ request }) => {
    const response = await request.get('/api/openrouter/callback', {
      maxRedirects: 0,
    });

    // Should redirect to settings with error
    expect(response.status()).toBe(302);

    const location = response.headers()['location'];
    expect(location).toContain('error=no_code');
  });

  test('redirects with error when no verifier cookie', async ({ request }) => {
    const response = await request.get('/api/openrouter/callback?code=test', {
      maxRedirects: 0,
    });

    // Should redirect to settings with error about missing verifier
    expect(response.status()).toBe(302);

    const location = response.headers()['location'];
    expect(location).toContain('error=missing_verifier');
  });
});

test.describe('OpenRouter BYOK - Full Flow Validation', () => {
  test('connect generates valid PKCE challenge from verifier', async ({
    request,
  }) => {
    const response = await request.get('/api/openrouter/connect', {
      maxRedirects: 0,
    });

    // Extract verifier from cookie
    const setCookie = response.headers()['set-cookie'];
    const verifierMatch = setCookie?.match(/openrouter_verifier=([^;]+)/);
    expect(verifierMatch).toBeTruthy();

    const verifier = verifierMatch![1];

    // Verifier should be base64url encoded (no +, /, or =)
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);

    // Verifier should be ~43 chars (32 bytes base64url encoded)
    expect(verifier.length).toBeGreaterThanOrEqual(40);
    expect(verifier.length).toBeLessThanOrEqual(50);
  });

  test('status endpoint is consistent across multiple calls', async ({
    request,
  }) => {
    const response1 = await request.get('/api/openrouter/status');
    const response2 = await request.get('/api/openrouter/status');

    const json1 = await response1.json();
    const json2 = await response2.json();

    expect(json1).toEqual(json2);
  });
});
