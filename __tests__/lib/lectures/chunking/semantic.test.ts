import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import {
  SemanticChunksSchema,
  detectTopicBoundaries,
  matchChunksToTimestamps,
  textSimilarity,
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
    it('should validate correct chunk structure', () => {
      const validData = {
        chunks: [
          { title: 'Introduction', text: 'Hello, welcome to the lecture.' },
          { title: 'Main Topic', text: 'Today we discuss algorithms.' },
        ],
      };

      const result = SemanticChunksSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it('should reject chunks without title', () => {
      const invalidData = {
        chunks: [{ text: 'Missing title field.' }],
      };

      const result = SemanticChunksSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should reject chunks without text', () => {
      const invalidData = {
        chunks: [{ title: 'Missing Text' }],
      };

      const result = SemanticChunksSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it('should accept empty chunks array', () => {
      const emptyData = { chunks: [] };

      const result = SemanticChunksSchema.safeParse(emptyData);
      expect(result.success).toBe(true);
    });
  });

  describe('textSimilarity', () => {
    it('should return 1.0 for identical strings', () => {
      expect(textSimilarity('hello world', 'hello world')).toBe(1.0);
    });

    it('should return 0.0 for completely different strings', () => {
      expect(textSimilarity('abc', 'xyz')).toBe(0.0);
    });

    it('should return value between 0 and 1 for partial matches', () => {
      const similarity = textSimilarity('hello world', 'hello there');
      expect(similarity).toBeGreaterThan(0.0);
      expect(similarity).toBeLessThan(1.0);
    });

    it('should be case-insensitive', () => {
      expect(textSimilarity('Hello World', 'hello world')).toBe(1.0);
    });

    it('should handle empty strings', () => {
      expect(textSimilarity('', '')).toBe(1.0);
      expect(textSimilarity('hello', '')).toBe(0.0);
      expect(textSimilarity('', 'hello')).toBe(0.0);
    });

    it('should handle strings with different whitespace', () => {
      const similarity = textSimilarity('hello  world', 'hello world');
      expect(similarity).toBeGreaterThan(0.9);
    });
  });

  describe('matchChunksToTimestamps', () => {
    const sampleSegments: WhisperSegment[] = [
      { id: 0, start: 0.0, end: 10.0, text: 'Welcome to the lecture.' },
      { id: 1, start: 10.0, end: 20.0, text: 'Today we discuss algorithms.' },
      { id: 2, start: 20.0, end: 30.0, text: 'First, let us talk about sorting.' },
      { id: 3, start: 30.0, end: 40.0, text: 'Merge sort is efficient.' },
      { id: 4, start: 40.0, end: 50.0, text: 'Now moving to searching.' },
      { id: 5, start: 50.0, end: 60.0, text: 'Binary search is fast.' },
    ];

    it('should match LLM chunks to Whisper segments', () => {
      const llmChunks = [
        {
          title: 'Introduction',
          text: 'Welcome to the lecture. Today we discuss algorithms.',
        },
        {
          title: 'Sorting Algorithms',
          text: 'First, let us talk about sorting. Merge sort is efficient.',
        },
        {
          title: 'Searching Algorithms',
          text: 'Now moving to searching. Binary search is fast.',
        },
      ];

      const matched = matchChunksToTimestamps(llmChunks, sampleSegments);

      expect(matched).toHaveLength(3);

      // First chunk: segments 0-1
      expect(matched[0].title).toBe('Introduction');
      expect(matched[0].start_seconds).toBe(0.0);
      expect(matched[0].end_seconds).toBe(20.0);
      expect(matched[0].segment_ids).toEqual([0, 1]);

      // Second chunk: segments 2-3
      expect(matched[1].title).toBe('Sorting Algorithms');
      expect(matched[1].start_seconds).toBe(20.0);
      expect(matched[1].end_seconds).toBe(40.0);
      expect(matched[1].segment_ids).toEqual([2, 3]);

      // Third chunk: segments 4-5
      expect(matched[2].title).toBe('Searching Algorithms');
      expect(matched[2].start_seconds).toBe(40.0);
      expect(matched[2].end_seconds).toBe(60.0);
      expect(matched[2].segment_ids).toEqual([4, 5]);
    });

    it('should handle single segment chunks when not last chunk', () => {
      // When there are multiple chunks, each should match its content
      const llmChunks = [
        { title: 'Welcome', text: 'Welcome to the lecture.' },
        { title: 'Rest', text: 'Today we discuss algorithms. First, let us talk about sorting. Merge sort is efficient. Now moving to searching. Binary search is fast.' },
      ];

      const matched = matchChunksToTimestamps(llmChunks, sampleSegments);

      expect(matched).toHaveLength(2);
      expect(matched[0].segment_ids).toEqual([0]); // First chunk matches only first segment
      expect(matched[1].segment_ids).toEqual([1, 2, 3, 4, 5]); // Second chunk gets the rest
    });

    it('should handle empty LLM chunks', () => {
      const matched = matchChunksToTimestamps([], sampleSegments);
      expect(matched).toHaveLength(0);
    });

    it('should handle empty segments', () => {
      const llmChunks = [{ title: 'Test', text: 'Some text' }];
      const matched = matchChunksToTimestamps(llmChunks, []);
      expect(matched).toHaveLength(0);
    });

    it('should set correct chunk_index', () => {
      const llmChunks = [
        { title: 'Part A', text: 'Welcome to the lecture.' },
        { title: 'Part B', text: 'Today we discuss algorithms.' },
      ];

      const matched = matchChunksToTimestamps(llmChunks, sampleSegments);

      expect(matched[0].chunk_index).toBe(0);
      expect(matched[1].chunk_index).toBe(1);
    });

    it('should handle text with slight variations', () => {
      // LLM might slightly alter text (extra punctuation, etc.)
      const llmChunks = [
        { title: 'Welcome', text: 'Welcome to the lecture!' }, // Different punctuation
      ];

      const matched = matchChunksToTimestamps(llmChunks, sampleSegments);

      // Should still match despite punctuation difference
      expect(matched).toHaveLength(1);
      expect(matched[0].segment_ids).toContain(0);
    });

    it('should handle chunks spanning many segments', () => {
      const llmChunks = [
        {
          title: 'Full Content',
          text: 'Welcome to the lecture. Today we discuss algorithms. First, let us talk about sorting. Merge sort is efficient. Now moving to searching. Binary search is fast.',
        },
      ];

      const matched = matchChunksToTimestamps(llmChunks, sampleSegments);

      expect(matched).toHaveLength(1);
      expect(matched[0].segment_ids).toEqual([0, 1, 2, 3, 4, 5]);
      expect(matched[0].start_seconds).toBe(0.0);
      expect(matched[0].end_seconds).toBe(60.0);
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

    it('should call generateObject with correct parameters', async () => {
      generateObjectMock.mockResolvedValueOnce({
        object: {
          chunks: [
            { title: 'Introduction', text: 'Hello everyone.' },
          ],
        },
      });

      const transcript = 'Hello everyone.';
      await detectTopicBoundaries(transcript, 'test-api-key');

      expect(generateObjectMock).toHaveBeenCalledTimes(1);
      expect(generateObjectMock).toHaveBeenCalledWith(
        expect.objectContaining({
          schema: SemanticChunksSchema,
        })
      );

      // Verify prompt contains transcript
      const call = generateObjectMock.mock.calls[0][0];
      expect(call.prompt).toContain(transcript);
    });

    it('should return chunks from LLM response', async () => {
      const expectedChunks = [
        { title: 'Topic 1', text: 'First topic content.' },
        { title: 'Topic 2', text: 'Second topic content.' },
      ];

      generateObjectMock.mockResolvedValueOnce({
        object: { chunks: expectedChunks },
      });

      const result = await detectTopicBoundaries('Some transcript', 'test-key');

      expect(result).toEqual(expectedChunks);
    });

    it('should throw on LLM error', async () => {
      generateObjectMock.mockRejectedValueOnce(new Error('LLM API error'));

      await expect(
        detectTopicBoundaries('Some text', 'test-key')
      ).rejects.toThrow('LLM API error');
    });

    it('should handle empty transcript', async () => {
      generateObjectMock.mockResolvedValueOnce({
        object: { chunks: [] },
      });

      const result = await detectTopicBoundaries('', 'test-key');

      expect(result).toEqual([]);
    });
  });
});
