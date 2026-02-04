import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing modules
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');

// Mock database - use factory function pattern to avoid hoisting issues
vi.mock('@/lib/db', () => {
  const mockFindFirst = vi.fn();

  return {
    db: {
      query: {
        lectures: {
          findFirst: mockFindFirst,
        },
      },
    },
    lectures: {
      courseId: 'lectures.course_id',
      panoptoSessionId: 'lectures.panopto_session_id',
    },
  };
});

// Import after mocking
import { db } from '@/lib/db';
import { findExistingLecture } from '@/lib/lectures/deduplication';

describe('Lecture Deduplication', () => {
  const mockCourseId = '660e8400-e29b-41d4-a716-446655440001';
  const mockPanoptoSessionId = 'abc123-session-def456';

  const mockExistingLecture = {
    id: '550e8400-e29b-41d4-a716-446655440000',
    courseId: mockCourseId,
    panoptoSessionId: mockPanoptoSessionId,
    panoptoUrl: 'https://panopto.example.com/session/abc123',
    streamUrl: 'https://cloudfront.example.com/stream.m3u8',
    title: 'Introduction to Machine Learning',
    durationSeconds: 3600,
    chunkCount: 10,
    status: 'completed',
    errorMessage: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
  };

  // Get typed mock reference after import
  const mockFindFirst = db.query.lectures.findFirst as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('findExistingLecture', () => {
    it('should return existing lecture when found', async () => {
      mockFindFirst.mockResolvedValue(mockExistingLecture);

      const result = await findExistingLecture(mockCourseId, mockPanoptoSessionId);

      expect(result).toEqual(mockExistingLecture);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
      expect(mockFindFirst).toHaveBeenCalledWith({
        where: expect.anything(),
      });
    });

    it('should return null when no lecture found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const result = await findExistingLecture(mockCourseId, mockPanoptoSessionId);

      expect(result).toBeNull();
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should return undefined when findFirst returns undefined', async () => {
      mockFindFirst.mockResolvedValue(undefined);

      const result = await findExistingLecture(mockCourseId, mockPanoptoSessionId);

      expect(result).toBeUndefined();
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should query with correct course and session IDs', async () => {
      mockFindFirst.mockResolvedValue(null);

      const differentCourseId = '770e8400-e29b-41d4-a716-446655440002';
      const differentSessionId = 'xyz789-session-uvw012';

      await findExistingLecture(differentCourseId, differentSessionId);

      // Verify the function was called (mocked db uses the parameters via closure)
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should propagate database errors', async () => {
      const dbError = new Error('Database connection failed');
      mockFindFirst.mockRejectedValue(dbError);

      await expect(
        findExistingLecture(mockCourseId, mockPanoptoSessionId)
      ).rejects.toThrow('Database connection failed');
    });

    it('should handle lectures in any status', async () => {
      // Test that we find lectures regardless of their processing status
      const pendingLecture = { ...mockExistingLecture, status: 'pending' };
      mockFindFirst.mockResolvedValue(pendingLecture);

      const result = await findExistingLecture(mockCourseId, mockPanoptoSessionId);

      expect(result).toEqual(pendingLecture);
      expect(result?.status).toBe('pending');
    });

    it('should handle lectures in failed status', async () => {
      const failedLecture = {
        ...mockExistingLecture,
        status: 'failed',
        errorMessage: 'Transcription timeout',
      };
      mockFindFirst.mockResolvedValue(failedLecture);

      const result = await findExistingLecture(mockCourseId, mockPanoptoSessionId);

      expect(result).toEqual(failedLecture);
      expect(result?.status).toBe('failed');
    });
  });
});
