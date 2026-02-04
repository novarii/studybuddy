import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      lectures: {
        findFirst: vi.fn(),
      },
      userLectures: {
        findFirst: vi.fn(),
      },
    },
    delete: vi.fn(),
  },
  lectures: {
    id: { name: 'id' },
  },
  userLectures: {
    userId: { name: 'user_id' },
    lectureId: { name: 'lecture_id' },
  },
}));

vi.mock('@/lib/lectures/pipeline', () => ({
  deleteLectureChunks: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { deleteLectureChunks } from '@/lib/lectures/pipeline';

describe('GET /api/lectures/[id]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockFindFirstLectures = db.query.lectures.findFirst as ReturnType<typeof vi.fn>;
  const mockFindFirstUserLectures = db.query.userLectures.findFirst as ReturnType<typeof vi.fn>;

  const mockLecture = {
    id: 'lecture-uuid',
    courseId: 'course-uuid',
    panoptoSessionId: 'session-123',
    panoptoUrl: 'https://panopto.com/viewer?id=session-123',
    streamUrl: 'https://cloudfront.net/master.m3u8',
    title: 'Test Lecture',
    durationSeconds: 3600,
    chunkCount: 12,
    status: 'completed',
    errorMessage: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockFindFirstUserLectures.mockResolvedValue({
      userId: 'user_123',
      lectureId: 'lecture-uuid',
    });
    mockFindFirstLectures.mockResolvedValue(mockLecture);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function makeGetRequest(lectureId: string) {
    const { GET } = await import('@/app/api/lectures/[id]/route');
    const request = new Request(`http://localhost/api/lectures/${lectureId}`);
    return GET(request, { params: Promise.resolve({ id: lectureId }) });
  }

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const response = await makeGetRequest('lecture-uuid');

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('authorization', () => {
    it('returns 404 when lecture does not exist', async () => {
      mockFindFirstUserLectures.mockResolvedValue(null);
      mockFindFirstLectures.mockResolvedValue(null);

      const response = await makeGetRequest('non-existent-id');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Lecture not found');
    });

    it('returns 403 when user does not have access to lecture', async () => {
      mockFindFirstUserLectures.mockResolvedValue(null);
      mockFindFirstLectures.mockResolvedValue(mockLecture);

      const response = await makeGetRequest('lecture-uuid');

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');
    });
  });

  describe('successful retrieval', () => {
    it('returns 200 with lecture details', async () => {
      const response = await makeGetRequest('lecture-uuid');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('lecture-uuid');
      expect(data.title).toBe('Test Lecture');
      expect(data.status).toBe('completed');
    });

    it('includes all lecture fields in response', async () => {
      const response = await makeGetRequest('lecture-uuid');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('courseId');
      expect(data).toHaveProperty('panoptoSessionId');
      expect(data).toHaveProperty('panoptoUrl');
      expect(data).toHaveProperty('streamUrl');
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('durationSeconds');
      expect(data).toHaveProperty('chunkCount');
      expect(data).toHaveProperty('status');
      expect(data).toHaveProperty('errorMessage');
      expect(data).toHaveProperty('createdAt');
      expect(data).toHaveProperty('updatedAt');
    });

    it('formats dates as ISO strings', async () => {
      const response = await makeGetRequest('lecture-uuid');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(data.updatedAt).toBe('2024-01-01T00:00:00.000Z');
    });
  });
});

describe('DELETE /api/lectures/[id]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockFindFirstLectures = db.query.lectures.findFirst as ReturnType<typeof vi.fn>;
  const mockFindFirstUserLectures = db.query.userLectures.findFirst as ReturnType<typeof vi.fn>;
  const mockDelete = db.delete as ReturnType<typeof vi.fn>;
  const mockDeleteLectureChunks = deleteLectureChunks as ReturnType<typeof vi.fn>;

  const mockLecture = {
    id: 'lecture-uuid',
    courseId: 'course-uuid',
    panoptoSessionId: 'session-123',
    title: 'Test Lecture',
    status: 'completed',
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockFindFirstUserLectures.mockResolvedValue({
      userId: 'user_123',
      lectureId: 'lecture-uuid',
    });
    mockFindFirstLectures.mockResolvedValue(mockLecture);
    mockDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDeleteLectureChunks.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  async function makeDeleteRequest(lectureId: string) {
    const { DELETE } = await import('@/app/api/lectures/[id]/route');
    const request = new Request(`http://localhost/api/lectures/${lectureId}`, {
      method: 'DELETE',
    });
    return DELETE(request, { params: Promise.resolve({ id: lectureId }) });
  }

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const response = await makeDeleteRequest('lecture-uuid');

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('authorization', () => {
    it('returns 404 when lecture does not exist', async () => {
      mockFindFirstUserLectures.mockResolvedValue(null);
      mockFindFirstLectures.mockResolvedValue(null);

      const response = await makeDeleteRequest('non-existent-id');

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Lecture not found');
    });

    it('returns 403 when user does not have access to lecture', async () => {
      mockFindFirstUserLectures.mockResolvedValue(null);
      mockFindFirstLectures.mockResolvedValue(mockLecture);

      const response = await makeDeleteRequest('lecture-uuid');

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Access denied');
    });
  });

  describe('deletion behavior', () => {
    it('removes user-lecture link', async () => {
      const response = await makeDeleteRequest('lecture-uuid');

      expect(response.status).toBe(200);
      expect(mockDelete).toHaveBeenCalled();
    });

    it('fully deletes lecture when no other users have access', async () => {
      // After first findFirst (for access check), second call returns user link
      // After deleting user link, third call returns null (no other users)
      mockFindFirstUserLectures
        .mockResolvedValueOnce({ userId: 'user_123', lectureId: 'lecture-uuid' })
        .mockResolvedValueOnce(null); // No other users

      const response = await makeDeleteRequest('lecture-uuid');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fullyDeleted).toBe(true);
      expect(data.message).toBe('Lecture deleted');
      expect(mockDeleteLectureChunks).toHaveBeenCalledWith('lecture-uuid');
    });

    it('only removes access when other users have access', async () => {
      // First call returns user link (access check passes)
      // After deleting user link, second call returns another user's link
      mockFindFirstUserLectures
        .mockResolvedValueOnce({ userId: 'user_123', lectureId: 'lecture-uuid' })
        .mockResolvedValueOnce({ userId: 'other_user', lectureId: 'lecture-uuid' });

      const response = await makeDeleteRequest('lecture-uuid');

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.fullyDeleted).toBe(false);
      expect(data.message).toBe('Access removed');
      expect(mockDeleteLectureChunks).not.toHaveBeenCalled();
    });
  });
});
