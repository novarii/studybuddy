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
      messageSources: {
        findMany: vi.fn(),
      },
    },
  },
  chatSessions: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
  },
  chatMessages: {
    id: { name: 'id' },
    sessionId: { name: 'session_id' },
    role: { name: 'role' },
    content: { name: 'content' },
    createdAt: { name: 'created_at' },
  },
  messageSources: {
    id: { name: 'id' },
    messageId: { name: 'message_id' },
    sessionId: { name: 'session_id' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('GET /api/sessions/[id]/messages', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbSessionFindFirst = db.query.chatSessions.findFirst as ReturnType<typeof vi.fn>;
  const mockDbMessagesFindMany = db.query.chatMessages.findMany as ReturnType<typeof vi.fn>;
  const mockDbSourcesFindMany = db.query.messageSources.findMany as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    mockDbSessionFindFirst.mockResolvedValue({
      id: 'session-uuid',
      userId: 'user_123',
      courseId: 'course-uuid',
      title: 'Test Session',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    mockDbMessagesFindMany.mockResolvedValue([
      {
        id: 'msg-1',
        sessionId: 'session-uuid',
        role: 'user',
        content: 'Hello, how are you?',
        createdAt: new Date('2024-01-01T10:00:00Z'),
      },
      {
        id: 'msg-2',
        sessionId: 'session-uuid',
        role: 'assistant',
        content: 'I am doing well! How can I help you?',
        createdAt: new Date('2024-01-01T10:00:05Z'),
      },
    ]);

    mockDbSourcesFindMany.mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('session ownership', () => {
    it('returns 404 when session is not found', async () => {
      mockDbSessionFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/nonexistent/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Session not found');
    });

    it('returns 404 when session belongs to different user', async () => {
      mockDbSessionFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/other-users-session/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'other-users-session' }) });

      expect(response.status).toBe(404);
    });
  });

  describe('message retrieval', () => {
    it('returns messages in chronological order', async () => {
      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.messages).toHaveLength(2);
      expect(data.messages[0].role).toBe('user');
      expect(data.messages[1].role).toBe('assistant');
    });

    it('returns empty array when session has no messages', async () => {
      mockDbMessagesFindMany.mockResolvedValue([]);

      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.messages).toHaveLength(0);
    });

    it('includes sources for assistant messages', async () => {
      mockDbSourcesFindMany.mockResolvedValue([
        {
          id: 'source-1',
          messageId: 'msg-2',
          sessionId: 'session-uuid',
          sourceId: 'slide-doc1-5',
          sourceType: 'slide',
          chunkNumber: 1,
          contentPreview: 'Preview of the content',
          documentId: 'doc-uuid',
          slideNumber: 5,
          lectureId: null,
          startSeconds: null,
          endSeconds: null,
          courseId: 'course-uuid',
          ownerId: 'user_123',
          title: 'Lecture Notes',
          createdAt: new Date(),
        },
      ]);

      const { GET } = await import('@/app/api/sessions/[id]/messages/route');
      const request = new Request('http://localhost/api/sessions/session-uuid/messages');

      const response = await GET(request, { params: Promise.resolve({ id: 'session-uuid' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.messages[1].sources).toHaveLength(1);
      expect(data.messages[1].sources[0].sourceType).toBe('slide');
    });
  });
});
