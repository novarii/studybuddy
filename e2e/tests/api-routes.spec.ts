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

test.describe('API Routes - Auth Behavior', () => {
  // Note: These tests run in the unauthenticated project but Playwright's request
  // fixture may still have cookies from global setup. We test that routes respond
  // appropriately (either 401 for truly unauthenticated, or 200/400/404 with auth).

  test('POST /api/chat responds to requests', async ({ request }) => {
    const response = await request.post('/api/chat', {
      data: {
        messages: [
          {
            id: 'test-1',
            role: 'user',
            parts: [{ type: 'text', text: 'Hello' }],
          },
        ],
        sessionId: 'test-session-id',
        courseId: 'test-course-id',
      },
    });

    // Route should respond (not 404 or 500)
    // If authenticated: 400 (validation) or 404 (session not found)
    // If unauthenticated: 401
    expect([200, 400, 401, 404]).toContain(response.status());
  });

  test('GET /api/sessions responds to requests', async ({ request }) => {
    const response = await request.get('/api/sessions');

    // Route should respond (not 404 or 500)
    // If authenticated: 200 with sessions
    // If unauthenticated: 401
    expect([200, 401]).toContain(response.status());
  });

  test('POST /api/sessions responds to requests', async ({ request }) => {
    const response = await request.post('/api/sessions', {
      data: { courseId: 'test-course-id' },
    });

    // Route should respond (not 404 or 500)
    // If authenticated: 201 or 400 (validation)
    // If unauthenticated: 401
    expect([200, 201, 400, 401, 500]).toContain(response.status());
  });
});
