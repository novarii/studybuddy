import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  SemanticChunksSchema,
  detectTopicBoundaries,
  resolveChunksFromTimestamps,
  findClosestSegmentIndex,
} from '@/lib/lectures/chunking/semantic';
import type { WhisperSegment } from '@/lib/lectures/types';

// Mock the AI SDK generateObject
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

// Mock OpenRouter provider
vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => vi.fn()),
}));

describe('Semantic Chunking', () => {
  describe('SemanticChunksSchema', () => {
    it('should validate correct chunk structure with timestamps', () => {
      const validData = {
        chunks: [
          { title: 'Introduction', start: 0.0, end: 20.0 },
          { title: 'Main Topic', start: 20.0, end: 60.0 },
        ],
      };

      const result = SemanticChunksSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject chunks without title', () => {
      const invalidData = {
        chunks: [{ start: 0.0, end: 10.0 }],
      };

      const result = SemanticChunksSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject chunks without start', () => {
      const invalidData = {
        chunks: [{ title: 'Missing Start', end: 10.0 }],
      };

      const result = SemanticChunksSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject chunks without end', () => {
      const invalidData = {
        chunks: [{ title: 'Missing End', start: 0.0 }],
      };

      const result = SemanticChunksSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept empty chunks array', () => {
      const emptyData = { chunks: [] };

      const result = SemanticChunksSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
    });

    it('should reject old text-based schema', () => {
      const oldData = {
        chunks: [{ title: 'Old Format', text: 'Some verbatim text' }],
      };

      const result = SemanticChunksSchema.safeParse(oldData);
      expect(result.success).toBe(false);
    });
  });

  describe('findClosestSegmentIndex', () => {
    const segments: WhisperSegment[] = [
      { id: 0, start: 0.0, end: 10.0, text: 'First' },
      { id: 1, start: 10.0, end: 20.0, text: 'Second' },
      { id: 2, start: 20.0, end: 30.0, text: 'Third' },
      { id: 3, start: 30.0, end: 40.0, text: 'Fourth' },
    ];

    it('should find exact match', () => {
      expect(findClosestSegmentIndex(segments, 20.0)).toBe(2);
    });

    it('should find closest when between segments', () => {
      // 14.0 is closer to segment 1 (start=10.0) than segment 2 (start=20.0)
      expect(findClosestSegmentIndex(segments, 14.0)).toBe(1);
    });

    it('should find closest when slightly off', () => {
      // 19.5 is closer to segment 2 (start=20.0) than segment 1 (start=10.0)
      expect(findClosestSegmentIndex(segments, 19.5)).toBe(2);
    });

    it('should return first segment for timestamp before all', () => {
      expect(findClosestSegmentIndex(segments, -5.0)).toBe(0);
    });

    it('should return last segment for timestamp after all', () => {
      expect(findClosestSegmentIndex(segments, 100.0)).toBe(3);
    });
  });

  describe('resolveChunksFromTimestamps', () => {
    const sampleSegments: WhisperSegment[] = [
      { id: 0, start: 0.0, end: 10.0, text: 'Welcome to the lecture.' },
      { id: 1, start: 10.0, end: 20.0, text: 'Today we discuss algorithms.' },
      { id: 2, start: 20.0, end: 30.0, text: 'First, let us talk about sorting.' },
      { id: 3, start: 30.0, end: 40.0, text: 'Merge sort is efficient.' },
      { id: 4, start: 40.0, end: 50.0, text: 'Now moving to searching.' },
      { id: 5, start: 50.0, end: 60.0, text: 'Binary search is fast.' },
    ];

    it('should resolve LLM timestamp boundaries to chunks', () => {
      const llmChunks = [
        { title: 'Introduction', start: 0.0, end: 20.0 },
        { title: 'Sorting Algorithms', start: 20.0, end: 40.0 },
        { title: 'Searching Algorithms', start: 40.0, end: 60.0 },
      ];

      const resolved = resolveChunksFromTimestamps(llmChunks, sampleSegments);

      expect(resolved).toHaveLength(3);

      // First chunk: segments 0-1
      expect(resolved[0].title).toBe('Introduction');
      expect(resolved[0].start_seconds).toBe(0.0);
      expect(resolved[0].end_seconds).toBe(20.0);
      expect(resolved[0].segment_ids).toEqual([0, 1]);
      expect(resolved[0].text).toBe(
        'Welcome to the lecture. Today we discuss algorithms.'
      );

      // Second chunk: segments 2-3
      expect(resolved[1].title).toBe('Sorting Algorithms');
      expect(resolved[1].start_seconds).toBe(20.0);
      expect(resolved[1].end_seconds).toBe(40.0);
      expect(resolved[1].segment_ids).toEqual([2, 3]);

      // Third chunk (last): extends to final segment (segments 4-5)
      expect(resolved[2].title).toBe('Searching Algorithms');
      expect(resolved[2].start_seconds).toBe(40.0);
      expect(resolved[2].end_seconds).toBe(60.0);
      expect(resolved[2].segment_ids).toEqual([4, 5]);
    });

    it('should handle single chunk covering all segments', () => {
      const llmChunks = [
        { title: 'Full Lecture', start: 0.0, end: 60.0 },
      ];

      const resolved = resolveChunksFromTimestamps(llmChunks, sampleSegments);

      expect(resolved).toHaveLength(1);
      expect(resolved[0].segment_ids).toEqual([0, 1, 2, 3, 4, 5]);
      expect(resolved[0].start_seconds).toBe(0.0);
      expect(resolved[0].end_seconds).toBe(60.0);
    });

    it('should handle last chunk extending to final segment', () => {
      const llmChunks = [
        { title: 'Welcome', start: 0.0, end: 10.0 },
        { title: 'Rest', start: 10.0, end: 40.0 },
      ];

      const resolved = resolveChunksFromTimestamps(llmChunks, sampleSegments);

      expect(resolved).toHaveLength(2);
      expect(resolved[0].segment_ids).toEqual([0]);
      // Last chunk extends to final segment
      expect(resolved[1].segment_ids).toEqual([1, 2, 3, 4, 5]);
    });

    it('should handle empty LLM chunks', () => {
      const resolved = resolveChunksFromTimestamps([], sampleSegments);
      expect(resolved).toHaveLength(0);
    });

    it('should handle empty segments', () => {
      const llmChunks = [{ title: 'Test', start: 0.0, end: 10.0 }];
      const resolved = resolveChunksFromTimestamps(llmChunks, []);
      expect(resolved).toHaveLength(0);
    });

    it('should set correct chunk_index', () => {
      const llmChunks = [
        { title: 'Part A', start: 0.0, end: 20.0 },
        { title: 'Part B', start: 20.0, end: 60.0 },
      ];

      const resolved = resolveChunksFromTimestamps(llmChunks, sampleSegments);

      expect(resolved[0].chunk_index).toBe(0);
      expect(resolved[1].chunk_index).toBe(1);
    });

    it('should handle slightly off timestamps via nearest-match', () => {
      const llmChunks = [
        { title: 'Intro', start: 0.5, end: 19.0 },
        { title: 'Main', start: 21.0, end: 60.0 },
      ];

      const resolved = resolveChunksFromTimestamps(llmChunks, sampleSegments);

      expect(resolved).toHaveLength(2);
      // 0.5 → segment 0, next chunk starts at 21.0 → segment 2, so endIdx = 1
      expect(resolved[0].segment_ids).toEqual([0, 1]);
      // Last chunk: 21.0 closest to segment 2, extends to end
      expect(resolved[1].segment_ids).toEqual([2, 3, 4, 5]);
    });
  });

  describe('detectTopicBoundaries', () => {
    let generateObjectMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
      const ai = await import('ai');
      generateObjectMock = ai.generateObject as ReturnType<typeof vi.fn>;
      generateObjectMock.mockReset();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should call generateObject with timestamped segment format', async () => {
      generateObjectMock.mockResolvedValueOnce({
        object: {
          chunks: [
            { title: 'Introduction', start: 0.0, end: 10.0 },
          ],
        },
      });

      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 5.0, text: 'Hello everyone.' },
        { id: 1, start: 5.0, end: 10.0, text: 'Welcome to class.' },
      ];

      await detectTopicBoundaries(segments, 'test-api-key');

      expect(generateObjectMock).toHaveBeenCalledTimes(1);
      expect(generateObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: SemanticChunksSchema,
        })
      );

      // Verify prompt contains timestamped format
      const call = generateObjectMock.mock.calls[0][0];
      expect(call.prompt).toContain('[0.0] Hello everyone.');
      expect(call.prompt).toContain('[5.0] Welcome to class.');
    });

    it('should return chunks from LLM response', async () => {
      const expectedChunks = [
        { title: 'Topic 1', start: 0.0, end: 30.0 },
        { title: 'Topic 2', start: 30.0, end: 60.0 },
      ];

      generateObjectMock.mockResolvedValueOnce({
        object: { chunks: expectedChunks },
      });

      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 30.0, text: 'First topic content.' },
        { id: 1, start: 30.0, end: 60.0, text: 'Second topic content.' },
      ];

      const result = await detectTopicBoundaries(segments, 'test-key');

      expect(result).toEqual(expectedChunks);
    });

    it('should throw on LLM error', async () => {
      generateObjectMock.mockRejectedValueOnce(new Error('LLM API error'));

      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 10.0, text: 'Some text' },
      ];

      await expect(
        detectTopicBoundaries(segments, 'test-key')
      ).rejects.toThrow('LLM API error');
    });

    it('should handle empty segments', async () => {
      generateObjectMock.mockResolvedValueOnce({
        object: { chunks: [] },
      });

      const result = await detectTopicBoundaries([], 'test-key');

      expect(result).toEqual([]);
    });
  });
});
