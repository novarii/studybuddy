import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Store original fetch
const originalFetch = global.fetch;

describe('lib/api - session endpoints', () => {
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.resetModules();
  });

  describe('sessions.list', () => {
    it('calls local /api/sessions endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessions: [] }),
      });

      const { api } = await import('@/lib/api');
      await api.sessions.list('test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
            'Content-Type': 'application/json',
          }),
        })
      );
    });

    it('includes courseId query parameter when provided', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ sessions: [] }),
      });

      const { api } = await import('@/lib/api');
      await api.sessions.list('test-token', 'course-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions?courseId=course-123',
        expect.any(Object)
      );
    });

    it('transforms response to match expected format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            sessions: [
              {
                id: 'session-1',
                courseId: 'course-1',
                title: 'Test Session',
                createdAt: '2024-01-01T00:00:00Z',
                updatedAt: '2024-01-02T00:00:00Z',
              },
            ],
          }),
      });

      const { api } = await import('@/lib/api');
      const result = await api.sessions.list('test-token');

      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0]).toEqual({
        session_id: 'session-1',
        course_id: 'course-1',
        session_name: 'Test Session',
        created_at: '2024-01-01T00:00:00Z',
        updated_at: '2024-01-02T00:00:00Z',
      });
    });
  });

  describe('sessions.create', () => {
    it('calls local /api/sessions with POST', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'new-session',
            courseId: 'course-1',
            title: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          }),
      });

      const { api } = await import('@/lib/api');
      await api.sessions.create('test-token', 'course-1');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ courseId: 'course-1' }),
        })
      );
    });

    it('transforms response to match expected format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: 'new-session',
            courseId: 'course-1',
            title: null,
            createdAt: '2024-01-01T00:00:00Z',
            updatedAt: '2024-01-01T00:00:00Z',
          }),
      });

      const { api } = await import('@/lib/api');
      const result = await api.sessions.create('test-token', 'course-1');

      expect(result.session_id).toBe('new-session');
    });
  });

  describe('sessions.getMessages', () => {
    it('calls local /api/sessions/[id]/messages endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ messages: [] }),
      });

      const { api } = await import('@/lib/api');
      await api.sessions.getMessages('test-token', 'session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-123/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'Bearer test-token',
          }),
        })
      );
    });

    it('transforms messages with sources to expected format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            messages: [
              {
                id: 'msg-1',
                role: 'user',
                content: 'Hello',
                createdAt: '2024-01-01T00:00:00Z',
              },
              {
                id: 'msg-2',
                role: 'assistant',
                content: 'Hi there',
                createdAt: '2024-01-01T00:00:01Z',
                sources: [
                  {
                    sourceId: 'src-1',
                    sourceType: 'slide',
                    chunkNumber: 1,
                    contentPreview: 'Preview text',
                    documentId: 'doc-1',
                    slideNumber: 5,
                    title: 'Slide Title',
                  },
                ],
              },
            ],
          }),
      });

      const { api } = await import('@/lib/api');
      const result = await api.sessions.getMessages('test-token', 'session-123');

      expect(result).toHaveLength(2);
      expect(result[0].role).toBe('user');
      expect(result[0].created_at).toBe('2024-01-01T00:00:00Z');
      expect(result[1].sources).toHaveLength(1);
      expect(result[1].sources![0]).toEqual({
        source_id: 'src-1',
        source_type: 'slide',
        chunk_number: 1,
        content_preview: 'Preview text',
        document_id: 'doc-1',
        slide_number: 5,
        title: 'Slide Title',
      });
    });
  });

  describe('sessions.delete', () => {
    it('calls local /api/sessions/[id] with DELETE', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 204,
      });

      const { api } = await import('@/lib/api');
      await api.sessions.delete('test-token', 'session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-123',
        expect.objectContaining({
          method: 'DELETE',
        })
      );
    });
  });

  describe('sessions.generateTitle', () => {
    it('calls local /api/sessions/[id]/generate-title with POST', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ title: 'Generated Title' }),
      });

      const { api } = await import('@/lib/api');
      await api.sessions.generateTitle('test-token', 'session-123');

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/sessions/session-123/generate-title',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('transforms response to match expected format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ title: 'Generated Title' }),
      });

      const { api } = await import('@/lib/api');
      const result = await api.sessions.generateTitle('test-token', 'session-123');

      expect(result.session_name).toBe('Generated Title');
    });
  });

  describe('error handling', () => {
    it('throws error on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      });

      const { api } = await import('@/lib/api');

      await expect(api.sessions.list('bad-token')).rejects.toThrow();
    });
  });
});
