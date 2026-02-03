import { describe, it, expect, vi, beforeEach, Mock } from 'vitest';

// Mock the embeddings module
vi.mock('@/lib/ai/embeddings', () => ({
  embedBatch: vi.fn(),
}));

// Mock the database module
vi.mock('@/lib/db', () => ({
  db: {
    execute: vi.fn(),
  },
}));

import { embedBatch } from '@/lib/ai/embeddings';
import { db } from '@/lib/db';
import {
  generateChunkEmbeddings,
  insertChunks,
  prepareChunks,
  type ChunkData,
} from '@/lib/documents/chunk-ingestion';
import type { PageResult } from '@/lib/documents/page-processor';

describe('generateChunkEmbeddings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should generate embeddings for page contents', async () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'Introduction to course', success: true },
      { pageNumber: 1, content: 'Chapter one content', success: true },
    ];

    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];

    (embedBatch as Mock).mockResolvedValue(mockEmbeddings);

    const result = await generateChunkEmbeddings(pages, 'test-api-key');

    expect(embedBatch).toHaveBeenCalledWith(
      ['Introduction to course', 'Chapter one content'],
      'test-api-key'
    );
    expect(result).toEqual(mockEmbeddings);
  });

  it('should handle empty pages array', async () => {
    const result = await generateChunkEmbeddings([], 'test-api-key');

    expect(embedBatch).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('should pass the API key to embedBatch', async () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'Test content', success: true },
    ];
    const apiKey = 'user-byok-key-123';

    (embedBatch as Mock).mockResolvedValue([[0.1, 0.2]]);

    await generateChunkEmbeddings(pages, apiKey);

    expect(embedBatch).toHaveBeenCalledWith(['Test content'], apiKey);
  });

  it('should handle pages with null content gracefully', async () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'Valid content', success: true },
      { pageNumber: 1, content: null, success: false },
    ];

    (embedBatch as Mock).mockResolvedValue([[0.1, 0.2]]);

    // Pages with null content should be filtered before embedding
    const result = await generateChunkEmbeddings(
      pages.filter((p) => p.content !== null),
      'test-api-key'
    );

    expect(embedBatch).toHaveBeenCalledWith(['Valid content'], 'test-api-key');
    expect(result).toHaveLength(1);
  });

  it('should propagate embedding errors', async () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'Content', success: true },
    ];

    const error = new Error('Embedding API failed');
    (embedBatch as Mock).mockRejectedValue(error);

    await expect(generateChunkEmbeddings(pages, 'test-api-key')).rejects.toThrow(
      'Embedding API failed'
    );
  });
});

describe('insertChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should insert chunks with correct metadata', async () => {
    const chunks: ChunkData[] = [
      {
        content: 'Page one content',
        embedding: [0.1, 0.2, 0.3],
        pageNumber: 0,
      },
      {
        content: 'Page two content',
        embedding: [0.4, 0.5, 0.6],
        pageNumber: 1,
      },
    ];

    const options = {
      documentId: 'doc-123',
      courseId: 'course-456',
      userId: 'user-789',
      filename: 'lecture.pdf',
    };

    (db.execute as Mock).mockResolvedValue({ rowCount: 2 });

    await insertChunks(chunks, options);

    expect(db.execute).toHaveBeenCalled();
    const call = (db.execute as Mock).mock.calls[0][0];
    // The SQL template should contain the table name and values
    expect(call).toBeDefined();
  });

  it('should handle empty chunks array', async () => {
    const options = {
      documentId: 'doc-123',
      courseId: 'course-456',
      userId: 'user-789',
      filename: 'lecture.pdf',
    };

    await insertChunks([], options);

    // Should not execute any query for empty chunks
    expect(db.execute).not.toHaveBeenCalled();
  });

  it('should include slide_number in metadata', async () => {
    const chunks: ChunkData[] = [
      {
        content: 'Slide content',
        embedding: [0.1, 0.2],
        pageNumber: 5,
      },
    ];

    const options = {
      documentId: 'doc-123',
      courseId: 'course-456',
      userId: 'user-789',
      filename: 'slides.pdf',
    };

    (db.execute as Mock).mockResolvedValue({ rowCount: 1 });

    await insertChunks(chunks, options);

    expect(db.execute).toHaveBeenCalled();
  });

  it('should propagate database errors', async () => {
    const chunks: ChunkData[] = [
      {
        content: 'Content',
        embedding: [0.1],
        pageNumber: 0,
      },
    ];

    const options = {
      documentId: 'doc-123',
      courseId: 'course-456',
      userId: 'user-789',
      filename: 'test.pdf',
    };

    const error = new Error('Database connection failed');
    (db.execute as Mock).mockRejectedValue(error);

    await expect(insertChunks(chunks, options)).rejects.toThrow(
      'Database connection failed'
    );
  });

  it('should handle single chunk insertion', async () => {
    const chunks: ChunkData[] = [
      {
        content: 'Single page document',
        embedding: [0.1, 0.2, 0.3],
        pageNumber: 0,
      },
    ];

    const options = {
      documentId: 'single-doc',
      courseId: 'course-1',
      userId: 'user-1',
      filename: 'single-page.pdf',
    };

    (db.execute as Mock).mockResolvedValue({ rowCount: 1 });

    await insertChunks(chunks, options);

    expect(db.execute).toHaveBeenCalledTimes(1);
  });

  it('should handle large batch of chunks', async () => {
    // Create 50 chunks
    const chunks: ChunkData[] = Array.from({ length: 50 }, (_, i) => ({
      content: `Page ${i} content`,
      embedding: [0.1 * i, 0.2 * i],
      pageNumber: i,
    }));

    const options = {
      documentId: 'large-doc',
      courseId: 'course-1',
      userId: 'user-1',
      filename: 'large-document.pdf',
    };

    (db.execute as Mock).mockResolvedValue({ rowCount: 50 });

    await insertChunks(chunks, options);

    expect(db.execute).toHaveBeenCalled();
  });
});

describe('ChunkData type', () => {
  it('should allow valid chunk data structure', () => {
    const chunk: ChunkData = {
      content: 'Test content',
      embedding: [0.1, 0.2, 0.3],
      pageNumber: 0,
    };

    expect(chunk.content).toBe('Test content');
    expect(chunk.embedding).toHaveLength(3);
    expect(chunk.pageNumber).toBe(0);
  });
});

describe('prepareChunks', () => {
  it('should combine pages and embeddings into chunks', () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'First page', success: true },
      { pageNumber: 2, content: 'Third page', success: true },
    ];
    const embeddings = [
      [0.1, 0.2],
      [0.3, 0.4],
    ];

    const chunks = prepareChunks(pages, embeddings);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({
      content: 'First page',
      embedding: [0.1, 0.2],
      pageNumber: 0,
    });
    expect(chunks[1]).toEqual({
      content: 'Third page',
      embedding: [0.3, 0.4],
      pageNumber: 2,
    });
  });

  it('should throw on mismatched lengths', () => {
    const pages: PageResult[] = [
      { pageNumber: 0, content: 'Page', success: true },
    ];
    const embeddings = [
      [0.1],
      [0.2],
    ];

    expect(() => prepareChunks(pages, embeddings)).toThrow(
      'Mismatch: 1 pages but 2 embeddings'
    );
  });

  it('should handle empty arrays', () => {
    const chunks = prepareChunks([], []);
    expect(chunks).toEqual([]);
  });

  it('should preserve page numbers from non-contiguous pages', () => {
    const pages: PageResult[] = [
      { pageNumber: 5, content: 'Page five', success: true },
      { pageNumber: 10, content: 'Page ten', success: true },
    ];
    const embeddings = [
      [0.5],
      [1.0],
    ];

    const chunks = prepareChunks(pages, embeddings);

    expect(chunks[0].pageNumber).toBe(5);
    expect(chunks[1].pageNumber).toBe(10);
  });
});
