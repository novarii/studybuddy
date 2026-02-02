import { test, expect } from '@playwright/test';

/**
 * API Route Tests
 *
 * These tests verify that all API routes exist and respond correctly.
 * They test the routes directly without full browser authentication.
 */

test.describe('API Routes - Existence Check', () => {
  test('GET /api/sessions route exists', async ({ request }) => {
    const response = await request.get('/api/sessions');
    // Should return 401 (unauthorized) or 200 (if auth works), not 404
    expect(response.status()).not.toBe(404);
  });

  test('POST /api/sessions route exists', async ({ request }) => {
    const response = await request.post('/api/sessions', {
      data: { courseId: 'test-course-id' },
    });
    expect(response.status()).not.toBe(404);
  });

  test('POST /api/chat route exists', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: { messages: [], sessionId: 'test-session-id' },
    });
    expect(response.status()).not.toBe(404);
  });

  test('GET /api/sessions/[id]/messages route exists', async ({ request }) => {
    const response = await request.get('/api/sessions/test-id/messages');
    expect(response.status()).not.toBe(404);
  });

  test('DELETE /api/sessions/[id] route exists', async ({ request }) => {
    const response = await request.delete('/api/sessions/test-id');
    expect(response.status()).not.toBe(404);
  });

  test('POST /api/sessions/[id]/generate-title route exists', async ({
    request,
  }) => {
    const response = await request.post('/api/sessions/test-id/generate-title');
    expect(response.status()).not.toBe(404);
  });
});

test.describe('API Routes - Response Format', () => {
  test('Sessions list responds correctly', async ({ request }) => {
    const response = await request.get('/api/sessions');
    // Without auth, it may return HTML error page or JSON error
    // The important thing is the route exists and responds
    const status = response.status();
    expect([200, 401, 403]).toContain(status);
  });

  test('Messages endpoint responds correctly', async ({ request }) => {
    const response = await request.get('/api/sessions/test-id/messages');
    // Without auth, it may return HTML error page or JSON error
    const status = response.status();
    expect([200, 401, 403, 404]).toContain(status);
  });
});
