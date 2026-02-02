import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      chatSessions: {
        findFirst: vi.fn(),
      },
    },
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  chatSessions: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
    title: { name: 'title' },
    createdAt: { name: 'created_at' },
    updatedAt: { name: 'updated_at' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('DELETE /api/sessions/[id]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindFirst = db.query.chatSessions.findFirst as ReturnType<typeof vi.fn>;
  const mockDbDelete = db.delete as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    mockDbQueryFindFirst.mockResolvedValue({
      id: 'session-uuid',
      userId: 'user_123',
      courseId: 'course-uuid',
      title: 'Test Session',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

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

      const { DELETE } = await import('@/app/api/sessions/[id]/route');
      const request = new Request('http://localhost/api/sessions/session-uuid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('session ownership', () => {
    it('returns 404 when session is not found', async () => {
      mockDbQueryFindFirst.mockResolvedValue(null);

      const { DELETE } = await import('@/app/api/sessions/[id]/route');
      const request = new Request('http://localhost/api/sessions/nonexistent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Session not found');
    });

    it('returns 404 when session belongs to different user', async () => {
      // Query includes userId filter, so it returns null for wrong user
      mockDbQueryFindFirst.mockResolvedValue(null);

      const { DELETE } = await import('@/app/api/sessions/[id]/route');
      const request = new Request('http://localhost/api/sessions/other-users-session', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'other-users-session' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('session deletion', () => {
    it('deletes session and returns 204', async () => {
      const { DELETE } = await import('@/app/api/sessions/[id]/route');
      const request = new Request('http://localhost/api/sessions/session-uuid', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(204);
      expect(mockDbDelete).toHaveBeenCalled();
    });
  });
});
