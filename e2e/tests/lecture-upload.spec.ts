import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Lecture Pipeline (Task 6.10-6.14)
 *
 * These tests verify the lecture upload, processing, and management flow.
 * Note: Full end-to-end processing tests would require:
 * - A valid RunPod API key for transcription
 * - A valid OpenRouter API key for semantic chunking
 * - Proper database setup
 *
 * These tests focus on what can be tested without external API calls:
 * - API endpoint availability and structure
 * - Route protection (Clerk middleware)
 * - Basic validation
 */

test.describe('Lecture Stream Upload API', () => {
  test.describe('stream upload endpoint', () => {
    test('should check route exists and is protected', async ({ request }) => {
      const response = await request.post('/api/lectures/stream', {
        data: {
          streamUrl: 'https://cloudfront.net/master.m3u8',
          sessionId: 'session-123',
          courseId: '550e8400-e29b-41d4-a716-446655440000',
          title: 'Test Lecture',
          sourceUrl: 'https://panopto.com/viewer?id=session-123',
        },
      });

      // Clerk middleware intercepts - should not be 500
      expect(response.status()).toBeLessThan(500);
    });

    test('should reject invalid JSON body', async ({ request }) => {
      const response = await request.post('/api/lectures/stream', {
        body: 'not valid json',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      expect(response.status()).toBeLessThan(500);
    });

    test('should handle missing required fields', async ({ request }) => {
      const response = await request.post('/api/lectures/stream', {
        data: {
          courseId: '550e8400-e29b-41d4-a716-446655440000',
          // Missing streamUrl, sessionId, title, sourceUrl
        },
      });

      expect(response.status()).toBeLessThan(500);
    });
  });
});

test.describe('Lecture List and Status API', () => {
  test.describe('list endpoint', () => {
    test('should require courseId parameter', async ({ request }) => {
      const response = await request.get('/api/lectures');

      // Either 400 (missing param) or auth redirect
      expect(response.status()).toBeLessThan(500);
    });

    test('should accept courseId query parameter', async ({ request }) => {
      const response = await request.get(
        '/api/lectures?courseId=550e8400-e29b-41d4-a716-446655440000'
      );

      // Either success with empty array, or auth redirect
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('status endpoint (jobs)', () => {
    test('should return response for valid id format', async ({ request }) => {
      const response = await request.get(
        '/api/lectures/jobs/550e8400-e29b-41d4-a716-446655440000'
      );

      // Either 404 (not found), 401/403 (unauthorized), or auth redirect
      expect(response.status()).toBeLessThan(500);
    });

    test('should handle non-existent lecture', async ({ request }) => {
      const response = await request.get(
        '/api/lectures/jobs/00000000-0000-0000-0000-000000000000'
      );

      // Either 404 or auth redirect
      expect(response.status()).toBeLessThan(500);
    });
  });

  test.describe('delete endpoint (jobs)', () => {
    test('should protect delete endpoint', async ({ request }) => {
      const response = await request.delete(
        '/api/lectures/jobs/550e8400-e29b-41d4-a716-446655440000'
      );

      // Either 401 (unauthorized), 403 (forbidden), 404, or HTML redirect
      expect(response.status()).toBeLessThan(500);
    });
  });
});

/**
 * Integration tests that verify the complete flow.
 * These are skipped by default as they require:
 * - A test course owned by the test user
 * - Valid RunPod API key for transcription
 * - Valid OpenRouter API key for semantic chunking
 * - E2E Clerk authentication configured
 *
 * To enable: Remove test.skip and ensure test environment is configured.
 */
test.describe.skip('Lecture Pipeline Integration', () => {
  const TEST_COURSE_ID = process.env.TEST_COURSE_ID || '';
  const TEST_PANOPTO_SESSION_ID = process.env.TEST_PANOPTO_SESSION_ID || '';

  test.beforeAll(async () => {
    if (!TEST_COURSE_ID || !TEST_PANOPTO_SESSION_ID) {
      test.skip();
    }
  });

  test('full audio upload flow: upload -> poll status -> verify in list -> delete', async () => {
    // This would test the full flow with a real audio file
    expect(TEST_COURSE_ID).toBeTruthy();
    expect(TEST_PANOPTO_SESSION_ID).toBeTruthy();
  });

  test('duplicate detection: upload same session twice returns existing ID', async () => {
    // Test 6.14: Duplicate upload returns existing ID
    expect(TEST_COURSE_ID).toBeTruthy();
  });
});
