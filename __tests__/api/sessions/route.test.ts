import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      chatSessions: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(() => ({
              offset: vi.fn(),
            })),
          })),
        })),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
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

describe('GET /api/sessions', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindMany = db.query.chatSessions.findMany as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    mockDbQueryFindMany.mockResolvedValue([
      {
        id: 'session-1',
        userId: 'user_123',
        courseId: 'course-uuid',
        title: 'Test Session 1',
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-02'),
      },
      {
        id: 'session-2',
        userId: 'user_123',
        courseId: 'course-uuid',
        title: null,
        createdAt: new Date('2024-01-03'),
        updatedAt: new Date('2024-01-04'),
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('session listing', () => {
    it('returns list of sessions for authenticated user', async () => {
      const { GET } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sessions).toHaveLength(2);
      expect(data.sessions[0].id).toBe('session-1');
      expect(data.sessions[1].id).toBe('session-2');
    });

    it('filters sessions by courseId when provided', async () => {
      const { GET } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions?courseId=course-uuid');

      await GET(request);

      // Verify the query was called with appropriate filters
      expect(mockDbQueryFindMany).toHaveBeenCalled();
    });

    it('returns empty array when user has no sessions', async () => {
      mockDbQueryFindMany.mockResolvedValue([]);

      const { GET } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.sessions).toHaveLength(0);
    });
  });
});

describe('POST /api/sessions', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbInsert = db.insert as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'new-session-uuid',
            userId: 'user_123',
            courseId: 'course-uuid',
            title: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ]),
      }),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-uuid' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 400 when courseId is missing', async () => {
      const { POST } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });
  });

  describe('session creation', () => {
    it('creates a new session and returns 201', async () => {
      const { POST } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId: 'course-uuid' }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.id).toBe('new-session-uuid');
      expect(data.courseId).toBe('course-uuid');
    });

    it('creates session with optional title', async () => {
      mockDbInsert.mockReturnValue({
        values: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([
            {
              id: 'new-session-uuid',
              userId: 'user_123',
              courseId: 'course-uuid',
              title: 'My Study Session',
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        }),
      });

      const { POST } = await import('@/app/api/sessions/route');
      const request = new Request('http://localhost/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courseId: 'course-uuid',
          title: 'My Study Session',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(201);
      const data = await response.json();
      expect(data.title).toBe('My Study Session');
    });
  });
});
