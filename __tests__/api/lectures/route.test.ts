import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(),
    query: {
      lectures: {
        findFirst: vi.fn(),
        findMany: vi.fn(),
      },
      userLectures: {
        findFirst: vi.fn(),
      },
    },
  },
  lectures: {
    id: { name: 'id' },
    courseId: { name: 'course_id' },
    panoptoSessionId: { name: 'panopto_session_id' },
    panoptoUrl: { name: 'panopto_url' },
    title: { name: 'title' },
    durationSeconds: { name: 'duration_seconds' },
    chunkCount: { name: 'chunk_count' },
    status: { name: 'status' },
    errorMessage: { name: 'error_message' },
    createdAt: { name: 'created_at' },
    updatedAt: { name: 'updated_at' },
  },
  userLectures: {
    userId: { name: 'user_id' },
    lectureId: { name: 'lecture_id' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('GET /api/lectures', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockSelect = db.select as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    // Mock the chained query builder
    const mockFrom = vi.fn().mockReturnThis();
    const mockInnerJoin = vi.fn().mockReturnThis();
    const mockWhere = vi.fn().mockReturnThis();
    const mockOrderBy = vi.fn().mockResolvedValue([
      {
        id: 'lecture-1',
        courseId: 'course-uuid',
        panoptoSessionId: 'session-123',
        panoptoUrl: 'https://panopto.com/viewer?id=session-123',
        title: 'Lecture 1: Introduction',
        durationSeconds: 3600,
        chunkCount: 12,
        status: 'completed',
        errorMessage: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      {
        id: 'lecture-2',
        courseId: 'course-uuid',
        panoptoSessionId: 'session-456',
        panoptoUrl: 'https://panopto.com/viewer?id=session-456',
        title: 'Lecture 2: Basics',
        durationSeconds: null,
        chunkCount: null,
        status: 'processing',
        errorMessage: null,
        createdAt: new Date('2024-01-02'),
        updatedAt: new Date('2024-01-02'),
      },
    ]);

    mockSelect.mockReturnValue({
      from: mockFrom,
      innerJoin: mockInnerJoin,
      where: mockWhere,
      orderBy: mockOrderBy,
    });

    // Make chainable
    mockFrom.mockReturnValue({
      innerJoin: mockInnerJoin,
      where: mockWhere,
      orderBy: mockOrderBy,
    });

    mockInnerJoin.mockReturnValue({
      where: mockWhere,
      orderBy: mockOrderBy,
    });

    mockWhere.mockReturnValue({
      orderBy: mockOrderBy,
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 400 when courseId is missing', async () => {
      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures');

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });
  });

  describe('lecture listing', () => {
    it('returns list of lectures for the course', async () => {
      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.lectures).toHaveLength(2);
      expect(data.lectures[0].id).toBe('lecture-1');
      expect(data.lectures[0].status).toBe('completed');
      expect(data.lectures[0].title).toBe('Lecture 1: Introduction');
      expect(data.lectures[1].id).toBe('lecture-2');
      expect(data.lectures[1].status).toBe('processing');
    });

    it('returns empty array when no lectures exist', async () => {
      const mockOrderBy = vi.fn().mockResolvedValue([]);
      mockSelect.mockReturnValue({
        from: vi.fn().mockReturnValue({
          innerJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: mockOrderBy,
            }),
          }),
        }),
      });

      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.lectures).toHaveLength(0);
    });

    it('formats dates as ISO strings', async () => {
      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.lectures[0].createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(data.lectures[0].updatedAt).toBe('2024-01-01T00:00:00.000Z');
    });

    it('includes all lecture fields in response', async () => {
      const { GET } = await import('@/app/api/lectures/route');
      const request = new Request('http://localhost/api/lectures?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      const lecture = data.lectures[0];
      expect(lecture).toHaveProperty('id');
      expect(lecture).toHaveProperty('courseId');
      expect(lecture).toHaveProperty('panoptoSessionId');
      expect(lecture).toHaveProperty('panoptoUrl');
      expect(lecture).toHaveProperty('title');
      expect(lecture).toHaveProperty('durationSeconds');
      expect(lecture).toHaveProperty('chunkCount');
      expect(lecture).toHaveProperty('status');
      expect(lecture).toHaveProperty('errorMessage');
      expect(lecture).toHaveProperty('createdAt');
      expect(lecture).toHaveProperty('updatedAt');
    });
  });
});
