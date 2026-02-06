import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    delete: vi.fn(),
  },
  userApiKeys: {
    userId: { name: 'user_id' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('DELETE /api/openrouter/disconnect', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbDelete = db.delete as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { DELETE } = await import('@/app/api/openrouter/disconnect/route');

      const response = await DELETE();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('key deletion', () => {
    it('deletes user API key from database', async () => {
      const { DELETE } = await import('@/app/api/openrouter/disconnect/route');

      await DELETE();

      expect(mockDbDelete).toHaveBeenCalled();
    });

    it('returns success: true on successful deletion', async () => {
      const { DELETE } = await import('@/app/api/openrouter/disconnect/route');

      const response = await DELETE();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });

    it('returns success: true even if no key existed (idempotent)', async () => {
      // No-op deletion (key didn't exist)
      mockDbDelete.mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      });

      const { DELETE } = await import('@/app/api/openrouter/disconnect/route');

      const response = await DELETE();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns 500 on database error', async () => {
      mockDbDelete.mockReturnValue({
        where: vi.fn().mockRejectedValue(new Error('Database connection failed')),
      });

      const { DELETE } = await import('@/app/api/openrouter/disconnect/route');

      const response = await DELETE();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toBeTruthy();
    });
  });
});
