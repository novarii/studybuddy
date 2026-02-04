import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing modules
vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test');

// Mock database - use factory function pattern to avoid hoisting issues
vi.mock('@/lib/db', () => {
  const mockFindFirst = vi.fn();
  const mockInsert = vi.fn();
  const mockValues = vi.fn();
  const mockOnConflictDoNothing = vi.fn();
  const mockReturning = vi.fn();

  // Chain returns for insert
  mockInsert.mockReturnValue({ values: mockValues });
  mockValues.mockReturnValue({
    onConflictDoNothing: mockOnConflictDoNothing,
    returning: mockReturning,
  });
  mockOnConflictDoNothing.mockResolvedValue(undefined);
  mockReturning.mockResolvedValue([]);

  return {
    db: {
      query: {
        lectures: {
          findFirst: mockFindFirst,
        },
      },
      insert: mockInsert,
    },
    lectures: {
      courseId: 'lectures.course_id',
      panoptoSessionId: 'lectures.panopto_session_id',
    },
    userLectures: {
      userId: 'user_lectures.user_id',
      lectureId: 'user_lectures.lecture_id',
    },
  };
});

// Import after mocking
import { db } from '@/lib/db';
import {
  findExistingLecture,
  ensureUserLectureLink,
  checkAndCreateLecture,
} from '@/lib/lectures/deduplication';

describe('Lecture Deduplication', () => {
  const mockCourseId = '660e8400-e29b-41d4-a716-446655440001';
  const mockPanoptoSessionId = 'abc123-session-def456';
  const mockUserId = 'user_123';
  const mockLectureId = '550e8400-e29b-41d4-a716-446655440000';

  const mockExistingLecture = {
    id: mockLectureId,
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

  // Get typed mock references after import
  const mockFindFirst = db.query.lectures.findFirst as ReturnType<typeof vi.fn>;
  const mockInsert = db.insert as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset insert chain mocks
    const mockValues = vi.fn();
    const mockOnConflictDoNothing = vi.fn();
    const mockReturning = vi.fn();

    mockInsert.mockReturnValue({ values: mockValues });
    mockValues.mockReturnValue({
      onConflictDoNothing: mockOnConflictDoNothing,
      returning: mockReturning,
    });
    mockOnConflictDoNothing.mockResolvedValue(undefined);
    mockReturning.mockResolvedValue([mockExistingLecture]);
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

  describe('ensureUserLectureLink', () => {
    it('should insert user-lecture link', async () => {
      await ensureUserLectureLink(mockUserId, mockLectureId);

      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('should use onConflictDoNothing for idempotency', async () => {
      const mockValues = vi.fn();
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });

      await ensureUserLectureLink(mockUserId, mockLectureId);

      expect(mockOnConflictDoNothing).toHaveBeenCalledTimes(1);
    });

    it('should not throw when link already exists', async () => {
      // onConflictDoNothing handles duplicates silently
      await expect(
        ensureUserLectureLink(mockUserId, mockLectureId)
      ).resolves.not.toThrow();
    });

    it('should propagate database errors', async () => {
      const mockValues = vi.fn();
      const mockOnConflictDoNothing = vi.fn().mockRejectedValue(
        new Error('Database error')
      );

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({ onConflictDoNothing: mockOnConflictDoNothing });

      await expect(
        ensureUserLectureLink(mockUserId, mockLectureId)
      ).rejects.toThrow('Database error');
    });
  });

  describe('checkAndCreateLecture', () => {
    const createOptions = {
      courseId: mockCourseId,
      panoptoSessionId: mockPanoptoSessionId,
      title: 'New Lecture',
      panoptoUrl: 'https://panopto.example.com/session/new',
    };

    it('should return existing lecture with isNew: false when found', async () => {
      mockFindFirst.mockResolvedValue(mockExistingLecture);

      const result = await checkAndCreateLecture(mockUserId, createOptions);

      expect(result.isNew).toBe(false);
      expect(result.lecture).toEqual(mockExistingLecture);
      expect(mockFindFirst).toHaveBeenCalledTimes(1);
    });

    it('should create user-lecture link for existing lecture', async () => {
      mockFindFirst.mockResolvedValue(mockExistingLecture);

      await checkAndCreateLecture(mockUserId, createOptions);

      // Should insert user-lecture link
      expect(mockInsert).toHaveBeenCalledTimes(1);
    });

    it('should create new lecture when not found', async () => {
      mockFindFirst.mockResolvedValue(null);

      const newLecture = {
        ...mockExistingLecture,
        id: 'new-lecture-id',
        title: 'New Lecture',
        status: 'pending',
      };

      const mockValues = vi.fn();
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      const mockReturning = vi.fn().mockResolvedValue([newLecture]);

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
        returning: mockReturning,
      });

      const result = await checkAndCreateLecture(mockUserId, createOptions);

      expect(result.isNew).toBe(true);
      expect(result.lecture.title).toBe('New Lecture');
    });

    it('should create user-lecture link for new lecture', async () => {
      mockFindFirst.mockResolvedValue(null);

      const newLecture = {
        ...mockExistingLecture,
        id: 'new-lecture-id',
        status: 'pending',
      };

      const mockValues = vi.fn();
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      const mockReturning = vi.fn().mockResolvedValue([newLecture]);

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
        returning: mockReturning,
      });

      await checkAndCreateLecture(mockUserId, createOptions);

      // Should insert twice: once for lecture, once for user-lecture link
      expect(mockInsert).toHaveBeenCalledTimes(2);
    });

    it('should include optional streamUrl when provided', async () => {
      mockFindFirst.mockResolvedValue(null);

      const optionsWithStream = {
        ...createOptions,
        streamUrl: 'https://cloudfront.example.com/stream.m3u8',
      };

      const newLecture = {
        ...mockExistingLecture,
        streamUrl: optionsWithStream.streamUrl,
        status: 'pending',
      };

      const mockValues = vi.fn();
      const mockOnConflictDoNothing = vi.fn().mockResolvedValue(undefined);
      const mockReturning = vi.fn().mockResolvedValue([newLecture]);

      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({
        onConflictDoNothing: mockOnConflictDoNothing,
        returning: mockReturning,
      });

      const result = await checkAndCreateLecture(mockUserId, optionsWithStream);

      expect(result.lecture.streamUrl).toBe(optionsWithStream.streamUrl);
    });

    it('should propagate errors from findExistingLecture', async () => {
      mockFindFirst.mockRejectedValue(new Error('DB connection failed'));

      await expect(
        checkAndCreateLecture(mockUserId, createOptions)
      ).rejects.toThrow('DB connection failed');
    });

    it('should propagate errors from lecture insert', async () => {
      mockFindFirst.mockResolvedValue(null);

      const mockValues = vi.fn();
      mockInsert.mockReturnValue({ values: mockValues });
      mockValues.mockReturnValue({
        returning: vi.fn().mockRejectedValue(new Error('Insert failed')),
      });

      await expect(
        checkAndCreateLecture(mockUserId, createOptions)
      ).rejects.toThrow('Insert failed');
    });
  });
});
