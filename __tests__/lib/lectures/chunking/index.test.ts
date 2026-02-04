import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { chunkTranscript } from '@/lib/lectures/chunking';
import type { WhisperSegment } from '@/lib/lectures/types';

// Mock the semantic chunking module
vi.mock('@/lib/lectures/chunking/semantic', () => ({
  chunkBySemantic: vi.fn(),
}));

describe('Chunk Strategy Selector', () => {
  const sampleSegments: WhisperSegment[] = [
    { id: 0, start: 0.0, end: 60.0, text: 'Welcome to the lecture.' },
    { id: 1, start: 60.0, end: 120.0, text: 'Today we discuss algorithms.' },
    { id: 2, start: 120.0, end: 180.0, text: 'Sorting is important.' },
    { id: 3, start: 180.0, end: 240.0, text: 'Now let us talk about searching.' },
  ];

  let chunkBySemanticMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    const semantic = await import('@/lib/lectures/chunking/semantic');
    chunkBySemanticMock = semantic.chunkBySemantic as ReturnType<typeof vi.fn>;
    chunkBySemanticMock.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('chunkTranscript', () => {
    it('should use semantic chunking when API key is provided', async () => {
      const expectedChunks = [
        {
          title: 'Introduction',
          text: 'Welcome to the lecture. Today we discuss algorithms.',
          start_seconds: 0.0,
          end_seconds: 120.0,
          chunk_index: 0,
          segment_ids: [0, 1],
        },
        {
          title: 'Algorithms',
          text: 'Sorting is important. Now let us talk about searching.',
          start_seconds: 120.0,
          end_seconds: 240.0,
          chunk_index: 1,
          segment_ids: [2, 3],
        },
      ];

      chunkBySemanticMock.mockResolvedValueOnce(expectedChunks);

      const result = await chunkTranscript(sampleSegments, 'test-api-key');

      expect(chunkBySemanticMock).toHaveBeenCalledWith(sampleSegments, 'test-api-key');
      expect(result).toEqual(expectedChunks);
    });

    it('should fall back to time-based chunking when semantic fails', async () => {
      chunkBySemanticMock.mockRejectedValueOnce(new Error('LLM API error'));

      const result = await chunkTranscript(sampleSegments, 'test-api-key');

      // Should have fallen back to time-based
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toBe('Part 1'); // Time-based uses "Part N" titles
    });

    it('should use time-based chunking when no API key is provided', async () => {
      const result = await chunkTranscript(sampleSegments);

      // Should not call semantic chunking
      expect(chunkBySemanticMock).not.toHaveBeenCalled();

      // Should use time-based
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].title).toBe('Part 1');
    });

    it('should use time-based chunking when API key is empty string', async () => {
      const result = await chunkTranscript(sampleSegments, '');

      expect(chunkBySemanticMock).not.toHaveBeenCalled();
      expect(result[0].title).toBe('Part 1');
    });

    it('should handle empty segments array', async () => {
      const result = await chunkTranscript([], 'test-api-key');

      expect(result).toEqual([]);
      expect(chunkBySemanticMock).not.toHaveBeenCalled();
    });

    it('should log warning when falling back to time-based', async () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      chunkBySemanticMock.mockRejectedValueOnce(new Error('API timeout'));

      await chunkTranscript(sampleSegments, 'test-api-key');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Semantic chunking failed, falling back to time-based:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });

    it('should pass through semantic chunks without modification', async () => {
      const semanticChunks = [
        {
          title: 'Custom Topic',
          text: 'Custom text content.',
          start_seconds: 0.0,
          end_seconds: 100.0,
          chunk_index: 0,
          segment_ids: [0],
        },
      ];

      chunkBySemanticMock.mockResolvedValueOnce(semanticChunks);

      const result = await chunkTranscript(sampleSegments, 'api-key');

      expect(result).toBe(semanticChunks); // Same reference
    });
  });
});
