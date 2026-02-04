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

vi.mock('@/lib/lectures/utils', () => ({
  extractPanoptoSessionId: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { checkAndCreateLecture } from '@/lib/lectures/deduplication';
import { downloadAndProcessLecture } from '@/lib/lectures/pipeline';
import { extractPanoptoSessionId } from '@/lib/lectures/utils';

describe('POST /api/lectures/stream', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockCheckAndCreateLecture = checkAndCreateLecture as ReturnType<typeof vi.fn>;
  const mockDownloadAndProcessLecture = downloadAndProcessLecture as ReturnType<typeof vi.fn>;
  const mockExtractPanoptoSessionId = extractPanoptoSessionId as ReturnType<typeof vi.fn>;

  const mockLecture = {
    id: 'lecture-uuid',
    courseId: 'course-uuid',
    panoptoSessionId: 'session-123',
    title: 'Test Lecture',
    status: 'pending',
    createdAt: new Date('2024-01-01'),
  };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockExtractPanoptoSessionId.mockReturnValue('session-123');
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
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

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
      const request = createRequest({
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('streamUrl is required');
    });

    it('returns 400 when courseId is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        title: 'Test Lecture',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });

    it('returns 400 when title is missing', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('title is required');
    });

    it('returns 400 when session ID cannot be extracted', async () => {
      mockExtractPanoptoSessionId.mockImplementation(() => {
        throw new Error('Invalid URL format');
      });

      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://invalid-url.com/',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Unable to extract session ID from URL');
      expect(data.details).toBe('Invalid URL format');
    });
  });

  describe('successful upload', () => {
    it('returns 202 and creates lecture when new', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

      const response = await POST(request);

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.id).toBe('lecture-uuid');
      expect(data.title).toBe('Test Lecture');
      expect(data.status).toBe('pending');
      expect(data.created).toBe(true);
    });

    it('extracts session ID from panoptoUrl when provided', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
        panoptoUrl: 'https://panopto.com/viewer?id=session-from-panopto',
      });

      await POST(request);

      expect(mockExtractPanoptoSessionId).toHaveBeenCalledWith(
        'https://panopto.com/viewer?id=session-from-panopto'
      );
    });

    it('extracts session ID from streamUrl when panoptoUrl not provided', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/session-123/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

      await POST(request);

      expect(mockExtractPanoptoSessionId).toHaveBeenCalledWith(
        'https://cloudfront.net/session-123/master.m3u8'
      );
    });

    it('calls checkAndCreateLecture with correct parameters', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
        panoptoUrl: 'https://panopto.com/viewer?id=session-123',
      });

      await POST(request);

      expect(mockCheckAndCreateLecture).toHaveBeenCalledWith('user_123', {
        courseId: 'course-uuid',
        panoptoSessionId: 'session-123',
        title: 'Test Lecture',
        panoptoUrl: 'https://panopto.com/viewer?id=session-123',
        streamUrl: 'https://cloudfront.net/master.m3u8',
      });
    });

    it('triggers async download and processing for new lectures', async () => {
      const { POST } = await import('@/app/api/lectures/stream/route');
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

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
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

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
      const request = createRequest({
        streamUrl: 'https://cloudfront.net/master.m3u8',
        courseId: 'course-uuid',
        title: 'Test Lecture',
      });

      await POST(request);

      expect(mockDownloadAndProcessLecture).not.toHaveBeenCalled();
    });
  });
});
