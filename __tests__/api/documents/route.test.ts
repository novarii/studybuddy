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
        findMany: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  documents: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
    checksum: { name: 'checksum' },
    filename: { name: 'filename' },
    status: { name: 'status' },
    pageCount: { name: 'page_count' },
    uniquePageCount: { name: 'unique_page_count' },
    filePath: { name: 'file_path' },
    createdAt: { name: 'created_at' },
  },
}));

vi.mock('@/lib/documents', () => ({
  computeChecksum: vi.fn(),
  processDocument: vi.fn(),
}));

vi.mock('@/lib/storage/documents', () => ({
  storeDocument: vi.fn(),
}));

vi.mock('pdf-lib', () => ({
  PDFDocument: {
    load: vi.fn(),
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { computeChecksum, processDocument } from '@/lib/documents';
import { storeDocument } from '@/lib/storage/documents';
import { PDFDocument } from 'pdf-lib';

describe('GET /api/documents', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindMany = db.query.documents.findMany as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockDbQueryFindMany.mockResolvedValue([
      {
        id: 'doc-1',
        filename: 'lecture1.pdf',
        status: 'completed',
        pageCount: 10,
        uniquePageCount: 8,
        createdAt: new Date('2024-01-01'),
      },
      {
        id: 'doc-2',
        filename: 'lecture2.pdf',
        status: 'processing',
        pageCount: 5,
        uniquePageCount: null,
        createdAt: new Date('2024-01-02'),
      },
    ]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 400 when courseId is missing', async () => {
      const { GET } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents');

      const response = await GET(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });
  });

  describe('document listing', () => {
    it('returns list of documents for the course', async () => {
      const { GET } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.documents).toHaveLength(2);
      expect(data.documents[0].id).toBe('doc-1');
      expect(data.documents[0].status).toBe('completed');
      expect(data.documents[1].id).toBe('doc-2');
      expect(data.documents[1].status).toBe('processing');
    });

    it('returns empty array when no documents exist', async () => {
      mockDbQueryFindMany.mockResolvedValue([]);

      const { GET } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents?courseId=course-uuid');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.documents).toHaveLength(0);
    });

    it('filters by user and course', async () => {
      const { GET } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents?courseId=course-uuid');

      await GET(request);

      expect(mockDbQueryFindMany).toHaveBeenCalled();
    });
  });
});

describe('POST /api/documents', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQueryFindFirst = db.query.documents.findFirst as ReturnType<typeof vi.fn>;
  const mockDbInsert = db.insert as ReturnType<typeof vi.fn>;
  const mockDbUpdate = db.update as ReturnType<typeof vi.fn>;
  const mockComputeChecksum = computeChecksum as ReturnType<typeof vi.fn>;
  const mockStoreDocument = storeDocument as ReturnType<typeof vi.fn>;
  const mockProcessDocument = processDocument as ReturnType<typeof vi.fn>;
  const mockPDFDocument = PDFDocument as unknown as { load: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockComputeChecksum.mockReturnValue('abc123checksum');
    mockDbQueryFindFirst.mockResolvedValue(null);
    mockPDFDocument.load.mockResolvedValue({
      getPageCount: () => 5,
    });
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([
          {
            id: 'new-doc-uuid',
            userId: 'user_123',
            courseId: 'course-uuid',
            filename: 'test.pdf',
            checksum: 'abc123checksum',
            status: 'processing',
            pageCount: 5,
            createdAt: new Date(),
          },
        ]),
      }),
    });
    mockDbUpdate.mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    });
    mockStoreDocument.mockResolvedValue('/path/to/original.pdf');
    mockProcessDocument.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  function createPdfFormData(courseId?: string): FormData {
    const formData = new FormData();
    if (courseId) {
      formData.append('courseId', courseId);
    }
    const pdfBlob = new Blob(['%PDF-1.4 fake pdf content'], {
      type: 'application/pdf',
    });
    formData.append('file', pdfBlob, 'test.pdf');
    return formData;
  }

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('validation', () => {
    it('returns 400 when courseId is missing', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const formData = new FormData();
      const pdfBlob = new Blob(['%PDF-1.4 fake'], { type: 'application/pdf' });
      formData.append('file', pdfBlob, 'test.pdf');

      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });

    it('returns 400 when file is missing', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const formData = new FormData();
      formData.append('courseId', 'course-uuid');

      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('file is required');
    });

    it('returns 400 when file is not a PDF', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const formData = new FormData();
      formData.append('courseId', 'course-uuid');
      const textBlob = new Blob(['hello world'], { type: 'text/plain' });
      formData.append('file', textBlob, 'test.txt');

      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: formData,
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Only PDF files are allowed');
    });

    it('returns 400 when PDF is invalid', async () => {
      mockPDFDocument.load.mockRejectedValue(new Error('Invalid PDF'));

      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('Invalid PDF file');
    });
  });

  describe('duplicate detection', () => {
    it('returns 409 when document already exists (same checksum)', async () => {
      mockDbQueryFindFirst.mockResolvedValue({
        id: 'existing-doc-id',
        checksum: 'abc123checksum',
      });

      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      const response = await POST(request);

      expect(response.status).toBe(409);
      const data = await response.json();
      expect(data.error).toBe('Document already exists');
      expect(data.existingDocumentId).toBe('existing-doc-id');
    });
  });

  describe('successful upload', () => {
    it('returns 202 and creates document record', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      const response = await POST(request);

      expect(response.status).toBe(202);
      const data = await response.json();
      expect(data.id).toBe('new-doc-uuid');
      expect(data.status).toBe('processing');
      expect(data.pageCount).toBe(5);
    });

    it('stores the original PDF', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      await POST(request);

      expect(mockStoreDocument).toHaveBeenCalledWith(
        expect.any(Uint8Array),
        'user_123',
        'new-doc-uuid',
        'original'
      );
    });

    it('triggers async processing', async () => {
      const { POST } = await import('@/app/api/documents/route');
      const request = new Request('http://localhost/api/documents', {
        method: 'POST',
        body: createPdfFormData('course-uuid'),
      });

      await POST(request);

      // Verify processDocument was called with correct structure
      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          documentId: 'new-doc-uuid',
          pdfBytes: expect.any(Uint8Array),
          userId: 'user_123',
          courseId: 'course-uuid',
        })
      );
    });
  });
});
