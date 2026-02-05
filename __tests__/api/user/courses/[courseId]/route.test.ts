import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      courses: {
        findFirst: vi.fn(),
      },
      userCourses: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(),
    })),
  },
  courses: {
    id: { name: 'id' },
  },
  userCourses: {
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('POST /api/user/courses/[courseId]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockCoursesFindFirst = db.query.courses.findFirst as ReturnType<typeof vi.fn>;
  const mockUserCoursesFindFirst = db.query.userCourses.findFirst as ReturnType<typeof vi.fn>;
  const mockInsert = db.insert as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockCoursesFindFirst.mockResolvedValue({
      id: 'course-uuid-1',
      code: 'CSC 171',
      title: 'Introduction to Computer Science',
      instructor: 'John Doe',
      isOfficial: true,
    });
    mockUserCoursesFindFirst.mockResolvedValue(null);
    mockInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            userId: 'user_123',
            courseId: 'course-uuid-1',
            createdAt: new Date(),
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

      const { POST } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'POST',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 404 when course does not exist', async () => {
      mockCoursesFindFirst.mockResolvedValue(null);

      const { POST } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/nonexistent-id', {
        method: 'POST',
      });
      const params = Promise.resolve({ courseId: 'nonexistent-id' });

      const response = await POST(request, { params });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Course not found');
    });

    it('returns 409 when course is already added', async () => {
      mockUserCoursesFindFirst.mockResolvedValue({
        userId: 'user_123',
        courseId: 'course-uuid-1',
        createdAt: new Date(),
      });

      const { POST } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'POST',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Course already added');
    });
  });

  describe('adding course', () => {
    it('returns 200 with success message when course is added', async () => {
      const { POST } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'POST',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      const response = await POST(request, { params });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.message).toBe('Course added');
    });

    it('inserts correct user-course association', async () => {
      const mockValues = vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            userId: 'user_123',
            courseId: 'course-uuid-1',
            createdAt: new Date(),
          },
        ]),
      });
      mockInsert.mockReturnValue({ values: mockValues });

      const { POST } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'POST',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      await POST(request, { params });

      expect(mockInsert).toHaveBeenCalled();
      expect(mockValues).toHaveBeenCalledWith({
        userId: 'user_123',
        courseId: 'course-uuid-1',
      });
    });
  });
});

describe('DELETE /api/user/courses/[courseId]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDelete = db.delete as unknown as ReturnType<typeof vi.fn>;
  const mockWhere = vi.fn();

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDelete.mockReturnValue({ where: mockWhere });
    mockWhere.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { DELETE } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      const response = await DELETE(request, { params });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('removing course', () => {
    it('returns 204 when course is removed', async () => {
      const { DELETE } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      const response = await DELETE(request, { params });

      expect(response.status).toBe(204);
    });

    it('deletes user-course association (idempotent)', async () => {
      const { DELETE } = await import('@/app/api/user/courses/[courseId]/route');
      const request = new Request('http://localhost/api/user/courses/course-uuid-1', {
        method: 'DELETE',
      });
      const params = Promise.resolve({ courseId: 'course-uuid-1' });

      await DELETE(request, { params });

      expect(mockDelete).toHaveBeenCalled();
      expect(mockWhere).toHaveBeenCalled();
    });
  });
});
