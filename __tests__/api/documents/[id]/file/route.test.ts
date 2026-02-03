import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      documents: {
        findFirst: vi.fn(),
      },
    },
  },
  documents: {
    id: { name: 'id' },
  },
}));

vi.mock('@/lib/storage/documents', () => ({
  readDocument: vi.fn(),
  documentExists: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { readDocument, documentExists } from '@/lib/storage/documents';

describe('GET /api/documents/[id]/file', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindFirst = db.query.documents.findFirst as ReturnType<typeof vi.fn>;
  const mockReadDocument = readDocument as ReturnType<typeof vi.fn>;
  const mockDocumentExists = documentExists as ReturnType<typeof vi.fn>;

  const samplePdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbQueryFindFirst.mockResolvedValue({
      id: 'doc-123',
      userId: 'user_123',
      filename: 'lecture.pdf',
    });
    mockDocumentExists.mockResolvedValue(true);
    mockReadDocument.mockResolvedValue(samplePdfBytes);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('authorization', () => {
    it('returns 403 when user is not the owner', async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: 'doc-123',
        userId: 'other_user',
        filename: 'lecture.pdf',
      });

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('file lookup', () => {
    it('returns 404 when document does not exist', async () => {
      mockDbQueryFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/nonexistent/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    it('returns 404 when file does not exist on disk', async () => {
      mockDocumentExists.mockResolvedValue(false);
      mockReadDocument.mockRejectedValue(new Error('ENOENT'));

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('File not found');
    });
  });

  describe('file download', () => {
    it('returns processed PDF when available', async () => {
      mockDocumentExists.mockResolvedValue(true);

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(200);
      expect(mockReadDocument).toHaveBeenCalledWith('user_123', 'doc-123', 'processed');
    });

    it('returns original PDF when processed is not available', async () => {
      mockDocumentExists.mockResolvedValue(false);

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(200);
      expect(mockReadDocument).toHaveBeenCalledWith('user_123', 'doc-123', 'original');
    });

    it('sets correct Content-Type header', async () => {
      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.headers.get('Content-Type')).toBe('application/pdf');
    });

    it('sets Content-Disposition header for download', async () => {
      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('attachment');
      expect(disposition).toContain('filename=');
    });

    it('uses processed filename suffix when serving processed PDF', async () => {
      mockDocumentExists.mockResolvedValue(true);

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('lecture-processed.pdf');
    });

    it('uses original filename when serving original PDF', async () => {
      mockDocumentExists.mockResolvedValue(false);

      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      const disposition = response.headers.get('Content-Disposition');
      expect(disposition).toContain('lecture.pdf');
      expect(disposition).not.toContain('processed');
    });

    it('sets correct Content-Length header', async () => {
      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.headers.get('Content-Length')).toBe(samplePdfBytes.length.toString());
    });

    it('returns PDF bytes in response body', async () => {
      const { GET } = await import('@/app/api/documents/[id]/file/route');
      const request = new Request('http://localhost/api/documents/doc-123/file');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      const buffer = await response.arrayBuffer();
      const bytes = new Uint8Array(buffer);
      expect(bytes).toEqual(samplePdfBytes);
    });
  });
});
