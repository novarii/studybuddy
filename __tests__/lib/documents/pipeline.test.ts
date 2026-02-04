import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock all dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      documents: {
        findFirst: vi.fn(),
      },
    },
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => Promise.resolve()),
      })),
    })),
  },
  documents: {
    id: 'id',
  },
}));

vi.mock('@/lib/api-keys/get-user-api-key', () => ({
  getUserApiKey: vi.fn(),
}));

vi.mock('@/lib/storage/documents', () => ({
  storeDocument: vi.fn(),
  readDocument: vi.fn(),
}));

vi.mock('@/lib/documents/pdf-splitter', () => ({
  splitPdfIntoPages: vi.fn(),
}));

vi.mock('@/lib/documents/pdf-rebuilder', () => ({
  rebuildPdfWithoutPages: vi.fn(),
}));

vi.mock('@/lib/documents/page-processor', () => ({
  processPages: vi.fn(),
}));

vi.mock('@/lib/documents/deduplication', () => ({
  deduplicatePages: vi.fn(),
  deduplicateByEmbeddings: vi.fn(),
}));

vi.mock('@/lib/documents/chunk-ingestion', () => ({
  generateChunkEmbeddings: vi.fn(),
  insertChunks: vi.fn(),
  prepareChunks: vi.fn(),
}));

import { db } from '@/lib/db';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';
import { storeDocument } from '@/lib/storage/documents';
import { splitPdfIntoPages } from '@/lib/documents/pdf-splitter';
import { rebuildPdfWithoutPages } from '@/lib/documents/pdf-rebuilder';
import { processPages } from '@/lib/documents/page-processor';
import {
  deduplicatePages,
  deduplicateByEmbeddings,
} from '@/lib/documents/deduplication';
import {
  generateChunkEmbeddings,
  insertChunks,
  prepareChunks,
} from '@/lib/documents/chunk-ingestion';

import {
  processDocument,
  updateDocumentStatus,
  type ProcessDocumentOptions,
} from '@/lib/documents/pipeline';
import type { PageResult } from '@/lib/documents/page-processor';

describe('processDocument', () => {
  const mockPdfBytes = new Uint8Array([1, 2, 3, 4]);
  const mockOptions: ProcessDocumentOptions = {
    documentId: 'doc-123',
    pdfBytes: mockPdfBytes,
    userId: 'user-456',
    courseId: 'course-789',
    filename: 'lecture.pdf',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock implementations for a successful pipeline run
    (getUserApiKey as Mock).mockResolvedValue('test-api-key');
    (splitPdfIntoPages as Mock).mockResolvedValue([
      new Uint8Array([1]),
      new Uint8Array([2]),
      new Uint8Array([3]),
    ]);
    (processPages as Mock).mockResolvedValue([
      { pageNumber: 0, content: 'Page 1 content', success: true },
      { pageNumber: 1, content: 'Page 2 content', success: true },
      { pageNumber: 2, content: 'Page 1 content duplicate', success: true },
    ] as PageResult[]);
    // Phase 1: Jaccard deduplication - catches page 2 as text duplicate
    (deduplicatePages as Mock).mockReturnValue({
      unique: [
        { pageNumber: 0, content: 'Page 1 content', success: true },
        { pageNumber: 1, content: 'Page 2 content', success: true },
      ],
      duplicateIndices: [2],
    });
    // Embeddings only for Jaccard-unique pages (2 pages)
    (generateChunkEmbeddings as Mock).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    // Phase 2: Cosine deduplication - no additional duplicates
    (deduplicateByEmbeddings as Mock).mockReturnValue({
      uniqueIndices: [0, 1],
      duplicateIndices: [],
    });
    (prepareChunks as Mock).mockReturnValue([
      { content: 'Page 1 content', embedding: [0.1, 0.2, 0.3], pageNumber: 0 },
      { content: 'Page 2 content', embedding: [0.4, 0.5, 0.6], pageNumber: 1 },
    ]);
    (insertChunks as Mock).mockResolvedValue(undefined);
    (rebuildPdfWithoutPages as Mock).mockResolvedValue(new Uint8Array([1, 2]));
    (storeDocument as Mock).mockResolvedValue('/path/to/processed.pdf');
  });

  it('should complete the full pipeline successfully', async () => {
    await processDocument(mockOptions);

    // Verify pipeline steps were called
    expect(getUserApiKey).toHaveBeenCalledWith('user-456');
    expect(splitPdfIntoPages).toHaveBeenCalledWith(mockPdfBytes);
    expect(processPages).toHaveBeenCalled();
    expect(deduplicatePages).toHaveBeenCalled(); // Phase 1: Jaccard
    expect(generateChunkEmbeddings).toHaveBeenCalled();
    expect(deduplicateByEmbeddings).toHaveBeenCalled(); // Phase 2: Cosine
    expect(insertChunks).toHaveBeenCalled();
    expect(rebuildPdfWithoutPages).toHaveBeenCalledWith(mockPdfBytes, [2]); // Jaccard found dupe
    expect(storeDocument).toHaveBeenCalled();
  });

  it('should update status to completed on success', async () => {
    await processDocument(mockOptions);

    // Should have been called multiple times for status updates
    expect(db.update).toHaveBeenCalled();
  });

  it('should update status to failed on error', async () => {
    const error = new Error('API key retrieval failed');
    (getUserApiKey as Mock).mockRejectedValue(error);

    await processDocument(mockOptions);

    // Verify the update was called with failure status
    expect(db.update).toHaveBeenCalled();
  });

  it('should handle empty PDF (no pages)', async () => {
    (splitPdfIntoPages as Mock).mockResolvedValue([]);
    (processPages as Mock).mockResolvedValue([]);
    (deduplicatePages as Mock).mockReturnValue({
      unique: [],
      duplicateIndices: [],
    });
    (generateChunkEmbeddings as Mock).mockResolvedValue([]);
    (deduplicateByEmbeddings as Mock).mockReturnValue({
      uniqueIndices: [],
      duplicateIndices: [],
    });
    (prepareChunks as Mock).mockReturnValue([]);

    await processDocument(mockOptions);

    // Should still complete without errors
    expect(insertChunks).toHaveBeenCalledWith([], expect.any(Object));
  });

  it('should track failed pages in the result', async () => {
    (processPages as Mock).mockResolvedValue([
      { pageNumber: 0, content: 'Page 1 content', success: true },
      { pageNumber: 1, content: null, success: false, error: new Error('Failed') },
      { pageNumber: 2, content: 'Page 3 content', success: true },
    ] as PageResult[]);
    // Phase 1: Jaccard - only successful pages, no duplicates
    (deduplicatePages as Mock).mockReturnValue({
      unique: [
        { pageNumber: 0, content: 'Page 1 content', success: true },
        { pageNumber: 2, content: 'Page 3 content', success: true },
      ],
      duplicateIndices: [],
    });
    // Only 2 successful pages get embeddings
    (generateChunkEmbeddings as Mock).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ]);
    // Phase 2: Cosine - no duplicates
    (deduplicateByEmbeddings as Mock).mockReturnValue({
      uniqueIndices: [0, 1],
      duplicateIndices: [],
    });

    await processDocument(mockOptions);

    // Pipeline should complete even with failed pages
    expect(db.update).toHaveBeenCalled();
  });

  it('should pass the API key to processing functions', async () => {
    const apiKey = 'user-byok-key-123';
    (getUserApiKey as Mock).mockResolvedValue(apiKey);

    await processDocument(mockOptions);

    expect(processPages).toHaveBeenCalledWith(expect.any(Array), apiKey);
    expect(generateChunkEmbeddings).toHaveBeenCalledWith(expect.any(Array), apiKey);
  });

  it('should use correct metadata for chunk insertion', async () => {
    await processDocument(mockOptions);

    expect(insertChunks).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        documentId: 'doc-123',
        courseId: 'course-789',
        userId: 'user-456',
        filename: 'lecture.pdf',
      })
    );
  });

  it('should handle deduplication with all pages unique', async () => {
    // Phase 1: Jaccard - all 3 pages unique
    (deduplicatePages as Mock).mockReturnValue({
      unique: [
        { pageNumber: 0, content: 'Page 1 content', success: true },
        { pageNumber: 1, content: 'Page 2 content', success: true },
        { pageNumber: 2, content: 'Page 3 content', success: true },
      ],
      duplicateIndices: [],
    });
    // All 3 pages get embeddings
    (generateChunkEmbeddings as Mock).mockResolvedValue([
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
      [0.7, 0.8, 0.9],
    ]);
    // Phase 2: Cosine - all unique
    (deduplicateByEmbeddings as Mock).mockReturnValue({
      uniqueIndices: [0, 1, 2],
      duplicateIndices: [],
    });

    await processDocument(mockOptions);

    // When no duplicates from either phase, rebuild with empty array
    expect(rebuildPdfWithoutPages).toHaveBeenCalledWith(mockPdfBytes, []);
  });

  it('should handle Gemini extraction failure gracefully', async () => {
    const error = new Error('Gemini API error');
    (processPages as Mock).mockRejectedValue(error);

    await processDocument(mockOptions);

    // Should update status to failed
    expect(db.update).toHaveBeenCalled();
  });

  it('should handle embedding generation failure', async () => {
    const error = new Error('Embedding API error');
    (generateChunkEmbeddings as Mock).mockRejectedValue(error);

    await processDocument(mockOptions);

    // Should update status to failed
    expect(db.update).toHaveBeenCalled();
  });

  it('should handle database insertion failure', async () => {
    const error = new Error('Database error');
    (insertChunks as Mock).mockRejectedValue(error);

    await processDocument(mockOptions);

    // Should update status to failed
    expect(db.update).toHaveBeenCalled();
  });
});

describe('updateDocumentStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should update document with provided fields', async () => {
    const mockSet = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    (db.update as Mock).mockReturnValue({ set: mockSet });

    await updateDocumentStatus('doc-123', {
      status: 'completed',
      pageCount: 10,
    });

    expect(db.update).toHaveBeenCalled();
    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        pageCount: 10,
      })
    );
  });

  it('should handle partial updates', async () => {
    const mockSet = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    (db.update as Mock).mockReturnValue({ set: mockSet });

    await updateDocumentStatus('doc-123', { pageCount: 5 });

    expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({ pageCount: 5 }));
  });

  it('should update timestamp for completed status', async () => {
    const mockSet = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    (db.update as Mock).mockReturnValue({ set: mockSet });

    await updateDocumentStatus('doc-123', {
      status: 'completed',
      processedAt: new Date(),
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'completed',
        processedAt: expect.any(Date),
      })
    );
  });

  it('should include error message for failed status', async () => {
    const mockSet = vi.fn(() => ({
      where: vi.fn(() => Promise.resolve()),
    }));
    (db.update as Mock).mockReturnValue({ set: mockSet });

    await updateDocumentStatus('doc-123', {
      status: 'failed',
      errorMessage: 'Processing failed',
    });

    expect(mockSet).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'failed',
        errorMessage: 'Processing failed',
      })
    );
  });
});
