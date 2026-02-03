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
    delete: vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    })),
    execute: vi.fn(),
  },
  documents: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
  },
}));

vi.mock('@/lib/storage/documents', () => ({
  deleteDocument: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { deleteDocument } from '@/lib/storage/documents';

describe('GET /api/documents/[id]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindFirst = db.query.documents.findFirst as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbQueryFindFirst.mockResolvedValue({
      id: 'doc-123',
      userId: 'user_123',
      courseId: 'course-uuid',
      filename: 'lecture.pdf',
      status: 'completed',
      pageCount: 10,
      uniquePageCount: 8,
      failedPages: [3],
      errorMessage: null,
      createdAt: new Date('2024-01-01'),
      processedAt: new Date('2024-01-01T00:05:00'),
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123');

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
        status: 'completed',
      });

      const { GET } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('document lookup', () => {
    it('returns 404 when document does not exist', async () => {
      mockDbQueryFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/nonexistent');

      const response = await GET(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    it('returns document details for valid request', async () => {
      const { GET } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.id).toBe('doc-123');
      expect(data.filename).toBe('lecture.pdf');
      expect(data.status).toBe('completed');
      expect(data.pageCount).toBe(10);
      expect(data.uniquePageCount).toBe(8);
      expect(data.duplicatesRemoved).toBe(2);
      expect(data.failedPages).toEqual([3]);
      expect(data.fileUrl).toBe('/api/documents/doc-123/file');
    });

    it('returns null duplicatesRemoved when counts are not available', async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: 'doc-123',
        userId: 'user_123',
        filename: 'lecture.pdf',
        status: 'processing',
        pageCount: null,
        uniquePageCount: null,
        createdAt: new Date(),
        processedAt: null,
      });

      const { GET } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123');

      const response = await GET(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.duplicatesRemoved).toBeNull();
      expect(data.processedAt).toBeNull();
    });
  });
});

describe('DELETE /api/documents/[id]', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindFirst = db.query.documents.findFirst as ReturnType<typeof vi.fn>;
  const mockDbDelete = db.delete as ReturnType<typeof vi.fn>;
  const mockDbExecute = db.execute as ReturnType<typeof vi.fn>;
  const mockDeleteDocument = deleteDocument as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbQueryFindFirst.mockResolvedValue({
      id: 'doc-123',
      userId: 'user_123',
      filename: 'lecture.pdf',
    });
    mockDbDelete.mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    });
    mockDbExecute.mockResolvedValue({ rowCount: 5 });
    mockDeleteDocument.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

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

      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(403);
      const data = await response.json();
      expect(data.error).toBe('Forbidden');
    });
  });

  describe('document deletion', () => {
    it('returns 404 when document does not exist', async () => {
      mockDbQueryFindFirst.mockResolvedValue(null);

      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/nonexistent', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'nonexistent' }) });

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Document not found');
    });

    it('deletes chunks from vector database', async () => {
      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(mockDbExecute).toHaveBeenCalled();
    });

    it('deletes document record from database', async () => {
      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(mockDbDelete).toHaveBeenCalled();
    });

    it('deletes files from storage', async () => {
      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(mockDeleteDocument).toHaveBeenCalledWith('user_123', 'doc-123');
    });

    it('returns success on valid deletion', async () => {
      const { DELETE } = await import('@/app/api/documents/[id]/route');
      const request = new Request('http://localhost/api/documents/doc-123', {
        method: 'DELETE',
      });

      const response = await DELETE(request, { params: Promise.resolve({ id: 'doc-123' }) });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.success).toBe(true);
    });
  });
});
