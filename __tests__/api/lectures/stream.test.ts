import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/lectures/deduplication', () => ({
  checkAndCreateLecture: vi.fn(),
}));

vi.mock('@/lib/lectures/pipeline', () => ({
  downloadAndProcessLecture: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { checkAndCreateLecture } from '@/lib/lectures/deduplication';
import { downloadAndProcessLecture } from '@/lib/lectures/pipeline';

describe('POST /api/lectures/stream', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockCheckAndCreateLecture = checkAndCreateLecture as ReturnType<typeof vi.fn>;
  const mockDownloadAndProcessLecture = downloadAndProcessLecture as ReturnType<typeof vi.fn>;

  const mockLecture = {
    id: 'lecture-uuid',
    courseId: 'course-uuid',
    panoptoSessionId: 'session-123',
    title: 'Test Lecture',
    status: 'pending',
    createdAt: new Date('2024-01-01'),
  };

  const validRequestBody = {
    streamUrl: 'https://cloudfront.net/master.m3u8',
    sessionId: 'session-123',
    courseId: 'course-uuid',
    title: 'Test Lecture',
    sourceUrl: 'https://panopto.com/viewer?id=session-123',
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockCheckAndCreateLecture.mockResolvedValue({
      lecture: mockLecture,
      isNew: true,
    });
    mockDownloadAndProcessLecture.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createRequest(body: object): Request {
    return new Request('http://localhost/api/lectures/stream', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 400 for invalid JSON body', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = new Request('http://localhost/api/lectures/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'invalid json',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid JSON body');
    });

    it('returns 400 when streamUrl is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const { streamUrl: _streamUrl, ...bodyWithoutStreamUrl } = validRequestBody;
      void _streamUrl; // Intentionally unused
      const request = createRequest(bodyWithoutStreamUrl);

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('streamUrl is required');
    });

    it('returns 400 when sessionId is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const { sessionId: _sessionId, ...bodyWithoutSessionId } = validRequestBody;
      void _sessionId; // Intentionally unused
      const request = createRequest(bodyWithoutSessionId);

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('sessionId is required');
    });

    it('returns 400 when courseId is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const { courseId: _courseId, ...bodyWithoutCourseId } = validRequestBody;
      void _courseId; // Intentionally unused
      const request = createRequest(bodyWithoutCourseId);

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });

    it('returns 400 when title is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const { title: _title, ...bodyWithoutTitle } = validRequestBody;
      void _title; // Intentionally unused
      const request = createRequest(bodyWithoutTitle);

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('title is required');
    });

    it('returns 400 when sourceUrl is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const { sourceUrl: _sourceUrl, ...bodyWithoutSourceUrl } = validRequestBody;
      void _sourceUrl; // Intentionally unused
      const request = createRequest(bodyWithoutSourceUrl);

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('sourceUrl is required');
    });
  });

  describe('successful upload', () => {
    it('returns 202 and creates lecture when new', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      const response = await POST(request);

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.id).toBe('lecture-uuid');
      expect(data.title).toBe('Test Lecture');
      expect(data.status).toBe('pending');
      expect(data.created).toBe(true);
    });

    it('calls checkAndCreateLecture with correct parameters', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      await POST(request);

      expect(mockCheckAndCreateLecture).toHaveBeenCalledWith('user_123', {
        courseId: 'course-uuid',
        panoptoSessionId: 'session-123',
        title: 'Test Lecture',
        panoptoUrl: 'https://panopto.com/viewer?id=session-123',
        streamUrl: 'https://cloudfront.net/master.m3u8',
        durationSeconds: undefined,
      });
    });

    it('passes duration when provided', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        ...validRequestBody,
        duration: 3600,
      });

      await POST(request);

      expect(mockCheckAndCreateLecture).toHaveBeenCalledWith('user_123', {
        courseId: 'course-uuid',
        panoptoSessionId: 'session-123',
        title: 'Test Lecture',
        panoptoUrl: 'https://panopto.com/viewer?id=session-123',
        streamUrl: 'https://cloudfront.net/master.m3u8',
        durationSeconds: 3600,
      });
    });

    it('triggers async download and processing for new lectures', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      await POST(request);

      expect(mockDownloadAndProcessLecture).toHaveBeenCalledWith({
        lectureId: 'lecture-uuid',
        userId: 'user_123',
        courseId: 'course-uuid',
        streamUrl: 'https://cloudfront.net/master.m3u8',
      });
    });
  });

  describe('duplicate detection', () => {
    it('returns 202 with created: false for existing lectures', async () => {
      mockCheckAndCreateLecture.mockResolvedValue({
        lecture: mockLecture,
        isNew: false,
      });

      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      const response = await POST(request);

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.id).toBe('lecture-uuid');
      expect(data.created).toBe(false);
    });

    it('does not trigger processing for existing lectures', async () => {
      mockCheckAndCreateLecture.mockResolvedValue({
        lecture: mockLecture,
        isNew: false,
      });

      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest(validRequestBody);

      await POST(request);

      expect(mockDownloadAndProcessLecture).not.toHaveBeenCalled();
    });
  });
});
