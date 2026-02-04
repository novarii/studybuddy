import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the sync service
vi.mock('@/lib/courses', () => ({
  syncCourses: vi.fn(),
}));

import { syncCourses } from '@/lib/courses';

describe('GET /api/cron/sync-courses', () => {
  const mockSyncCourses = syncCourses as unknown as ReturnType<typeof vi.fn>;
  const originalEnv = process.env.CRON_SECRET;

  beforeEach(() => {
    process.env.CRON_SECRET = 'test-cron-secret';
    mockSyncCourses.mockResolvedValue({
      created: 10,
      updated: 5,
      unchanged: 100,
      deleted: 2,
      total: 115,
      terms: ['Fall 2025', 'Spring 2025'],
      deletionSkipped: false,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = originalEnv;
  });

  describe('authentication', () => {
    it('returns 401 when Authorization header is missing', async () => {
      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('returns 401 when Authorization header has wrong secret', async () => {
      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses', {
        headers: { Authorization: 'Bearer wrong-secret' },
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
      const text = await response.text();
      expect(text).toBe('Unauthorized');
    });

    it('returns 401 when CRON_SECRET is not set', async () => {
      delete process.env.CRON_SECRET;

      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      });

      const response = await GET(request);

      expect(response.status).toBe(401);
    });
  });

  describe('successful sync', () => {
    it('returns 200 with sync results when Authorization is correct', async () => {
      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      });

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toEqual({
        created: 10,
        updated: 5,
        unchanged: 100,
        deleted: 2,
        total: 115,
        terms: ['Fall 2025', 'Spring 2025'],
        deletionSkipped: false,
      });
    });

    it('calls syncCourses with default terms', async () => {
      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      });

      await GET(request);

      expect(mockSyncCourses).toHaveBeenCalledWith({
        terms: ['Fall 2025', 'Spring 2025'],
      });
    });
  });

  describe('error handling', () => {
    it('returns 500 when syncCourses throws an error', async () => {
      mockSyncCourses.mockRejectedValue(new Error('CDCS fetch failed'));

      const { GET } = await import('@/app/api/cron/sync-courses/route');
      const request = new Request('http://localhost/api/cron/sync-courses', {
        headers: { Authorization: 'Bearer test-cron-secret' },
      });

      const response = await GET(request);

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBe('CDCS fetch failed');
    });
  });
});
