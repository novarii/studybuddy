import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        innerJoin: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(),
          })),
        })),
      })),
    })),
  },
  courses: {
    id: { name: 'id' },
    code: { name: 'code' },
    title: { name: 'title' },
    instructor: { name: 'instructor' },
    isOfficial: { name: 'is_official' },
    createdAt: { name: 'created_at' },
    updatedAt: { name: 'updated_at' },
  },
  userCourses: {
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
    createdAt: { name: 'created_at' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('GET /api/user/courses', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockOrderBy = vi.fn();
  const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }));
  const mockInnerJoin = vi.fn(() => ({ where: mockWhere }));
  const mockFrom = vi.fn(() => ({ innerJoin: mockInnerJoin }));
  const mockSelect = db.select as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockSelect.mockReturnValue({ from: mockFrom });
    mockOrderBy.mockResolvedValue([
      {
        courses: {
          id: 'course-uuid-1',
          code: 'CSC 171',
          title: 'Introduction to Computer Science',
          instructor: 'John Doe',
          isOfficial: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
      },
      {
        courses: {
          id: 'course-uuid-2',
          code: 'MTH 161',
          title: 'Calculus I',
          instructor: 'Jane Smith',
          isOfficial: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/user/courses/route');

      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('user course listing', () => {
    it('returns list of enrolled courses for authenticated user', async () => {
      const { GET } = await import('@/app/api/user/courses/route');

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.courses).toHaveLength(2);
      expect(data.courses[0]).toEqual({
        id: 'course-uuid-1',
        code: 'CSC 171',
        title: 'Introduction to Computer Science',
        instructor: 'John Doe',
        isOfficial: true,
      });
    });

    it('returns empty array when user has no enrolled courses', async () => {
      mockOrderBy.mockResolvedValue([]);

      const { GET } = await import('@/app/api/user/courses/route');

      const response = await GET();

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.courses).toHaveLength(0);
    });
  });
});
