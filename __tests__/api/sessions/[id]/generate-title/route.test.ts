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
      chatMessages: {
        findMany: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(),
        })),
      })),
    })),
  },
  chatSessions: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
    title: { name: 'title' },
  },
  chatMessages: {
    id: { name: 'id' },
    sessionId: { name: 'session_id' },
    role: { name: 'role' },
    content: { name: 'content' },
    createdAt: { name: 'created_at' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('POST /api/sessions/[id]/generate-title', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbSessionFindFirst = db.query.chatSessions.findFirst as ReturnType<typeof vi.fn>;
  const mockDbMessagesFindMany = db.query.chatMessages.findMany as ReturnType<typeof vi.fn>;
  const mockDbUpdate = db.update as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    mockDbSessionFindFirst.mockResolvedValue({
      id: 'session-uuid',
      userId: 'user_123',
      courseId: 'course-uuid',
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDbMessagesFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        sessionId: 'session-uuid',
        role: 'user',
        content: 'What is the mitochondria?',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
      {
        id: 'msg-2',
        sessionId: 'session-uuid',
        role: 'assistant',
        content: 'The mitochondria is the powerhouse of the cell...',
        createdAt: new Date('2024-01-01T10:00:05Z'),
      },
    ]);

    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'session-uuid',
              userId: 'user_123',
              courseId: 'course-uuid',
              title: 'What is the mitochondria?',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('session ownership', () => {
    it('returns 404 when session is not found', async () => {
      mockDbSessionFindFirst.mockResolvedValue(null);

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/nonexistent/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Session not found');
    });

    it('returns 404 when session belongs to different user', async () => {
      mockDbSessionFindFirst.mockResolvedValue(null);

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/other-users-session/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'other-users-session' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('title generation', () => {
    it('generates title from first user message', async () => {
      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBeDefined();
      expect(mockDbUpdate).toHaveBeenCalled();
    });

    it('truncates long titles to 50 characters with ellipsis', async () => {
      mockDbMessagesFindMany.mockResolvedValue([
        {
          id: 'msg-1',
          sessionId: 'session-uuid',
          role: 'user',
          content: 'This is a very long message that exceeds fifty characters and should be truncated properly',
          createdAt: new Date(),
        },
      ]);

      mockDbUpdate.mockReturnValue({
        set: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([
              {
                id: 'session-uuid',
                userId: 'user_123',
                courseId: 'course-uuid',
                title: 'This is a very long message that exceeds fifty ch...',
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ]),
          }),
        }),
      });

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title.length).toBeLessThanOrEqual(53); // 50 + '...'
    });

    it('returns null title when session has no messages', async () => {
      mockDbMessagesFindMany.mockResolvedValue([]);

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBeNull();
    });

    it('returns null title when session has no user messages', async () => {
      mockDbMessagesFindMany.mockResolvedValue([
        {
          id: 'msg-1',
          sessionId: 'session-uuid',
          role: 'assistant',
          content: 'How can I help you today?',
          createdAt: new Date(),
        },
      ]);

      const { POST } = await import('@/app/api/sessions/[id]/generate-title/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/generate-title', {
        method: 'POST',
      });

      const response = await POST(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.title).toBeNull();
    });
  });
});
