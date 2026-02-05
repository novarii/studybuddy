import { describe, it, expect } from 'vitest';

import { chunkByTime } from '@/lib/lectures/chunking/time-based';
import type { WhisperSegment } from '@/lib/lectures/types';

describe('Time-Based Chunking', () => {
  describe('chunkByTime', () => {
    it('should group segments into chunks of approximately target duration', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 60.0, text: 'First minute of content.' },
        { id: 1, start: 60.0, end: 120.0, text: 'Second minute of content.' },
        { id: 2, start: 120.0, end: 180.0, text: 'Third minute of content.' },
        { id: 3, start: 180.0, end: 240.0, text: 'Fourth minute of content.' },
        { id: 4, start: 240.0, end: 300.0, text: 'Fifth minute of content.' },
        { id: 5, start: 300.0, end: 360.0, text: 'Sixth minute of content.' },
      ];

      // Default 180s chunks should create 2 chunks
      const chunks = chunkByTime(segments);

      expect(chunks).toHaveLength(2);

      // First chunk: 0-180s
      expect(chunks[0].start_seconds).toBe(0.0);
      expect(chunks[0].end_seconds).toBe(180.0);
      expect(chunks[0].text).toContain('First minute');
      expect(chunks[0].text).toContain('Third minute');
      expect(chunks[0].segment_ids).toEqual([0, 1, 2]);

      // Second chunk: 180-360s
      expect(chunks[1].start_seconds).toBe(180.0);
      expect(chunks[1].end_seconds).toBe(360.0);
      expect(chunks[1].text).toContain('Fourth minute');
      expect(chunks[1].text).toContain('Sixth minute');
      expect(chunks[1].segment_ids).toEqual([3, 4, 5]);
    });

    it('should allow custom chunk duration', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 30.0, text: 'Segment 1.' },
        { id: 1, start: 30.0, end: 60.0, text: 'Segment 2.' },
        { id: 2, start: 60.0, end: 90.0, text: 'Segment 3.' },
        { id: 3, start: 90.0, end: 120.0, text: 'Segment 4.' },
      ];

      // 60s chunks should create 2 chunks
      const chunks = chunkByTime(segments, 60);

      expect(chunks).toHaveLength(2);
      expect(chunks[0].end_seconds).toBe(60.0);
      expect(chunks[1].start_seconds).toBe(60.0);
    });

    it('should handle empty segment array', () => {
      const chunks = chunkByTime([]);
      expect(chunks).toHaveLength(0);
    });

    it('should handle single segment', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 10.0, text: 'Only segment.' },
      ];

      const chunks = chunkByTime(segments);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toBe('Only segment.');
      expect(chunks[0].start_seconds).toBe(0.0);
      expect(chunks[0].end_seconds).toBe(10.0);
      expect(chunks[0].segment_ids).toEqual([0]);
    });

    it('should handle segments shorter than chunk duration', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 30.0, text: 'Short content.' },
        { id: 1, start: 30.0, end: 60.0, text: 'More short content.' },
      ];

      const chunks = chunkByTime(segments, 180);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].text).toContain('Short content.');
      expect(chunks[0].text).toContain('More short content.');
    });

    it('should generate auto-titles with chunk index', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 100.0, text: 'Content A.' },
        { id: 1, start: 100.0, end: 200.0, text: 'Content B.' },
        { id: 2, start: 200.0, end: 300.0, text: 'Content C.' },
      ];

      const chunks = chunkByTime(segments, 100);

      expect(chunks).toHaveLength(3);
      expect(chunks[0].title).toBe('Part 1');
      expect(chunks[1].title).toBe('Part 2');
      expect(chunks[2].title).toBe('Part 3');
    });

    it('should concatenate segment text with spaces', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 50.0, text: 'First part.' },
        { id: 1, start: 50.0, end: 100.0, text: 'Second part.' },
      ];

      const chunks = chunkByTime(segments, 200);

      expect(chunks[0].text).toBe('First part. Second part.');
    });

    it('should skip empty segments in text concatenation', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 50.0, text: 'Content.' },
        { id: 1, start: 50.0, end: 100.0, text: '' }, // Empty (garbage was detected)
        { id: 2, start: 100.0, end: 150.0, text: 'More content.' },
      ];

      const chunks = chunkByTime(segments, 200);

      expect(chunks[0].text).toBe('Content. More content.');
      expect(chunks[0].segment_ids).toEqual([0, 1, 2]); // All segment IDs preserved
    });

    it('should handle segments with varying durations', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 5.0, text: 'Short.' },
        { id: 1, start: 5.0, end: 150.0, text: 'Very long segment.' },
        { id: 2, start: 150.0, end: 155.0, text: 'Another short.' },
        { id: 3, start: 155.0, end: 200.0, text: 'Medium.' },
      ];

      // With 180s chunks, first chunk includes segments 0,1,2 (up to 155s)
      const chunks = chunkByTime(segments, 180);

      expect(chunks.length).toBeGreaterThanOrEqual(1);
      expect(chunks[0].segment_ids).toContain(0);
      expect(chunks[0].segment_ids).toContain(1);
    });

    it('should set correct chunk_index', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 100.0, text: 'A.' },
        { id: 1, start: 100.0, end: 200.0, text: 'B.' },
        { id: 2, start: 200.0, end: 300.0, text: 'C.' },
      ];

      const chunks = chunkByTime(segments, 100);

      expect(chunks[0].chunk_index).toBe(0);
      expect(chunks[1].chunk_index).toBe(1);
      expect(chunks[2].chunk_index).toBe(2);
    });

    it('should handle gaps between segments', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 30.0, text: 'First.' },
        { id: 1, start: 60.0, end: 90.0, text: 'Second after gap.' }, // Gap 30-60s
        { id: 2, start: 120.0, end: 150.0, text: 'Third.' },
      ];

      const chunks = chunkByTime(segments, 180);

      expect(chunks).toHaveLength(1);
      expect(chunks[0].start_seconds).toBe(0.0);
      expect(chunks[0].end_seconds).toBe(150.0);
    });

    it('should handle very short target duration', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 10.0, text: 'A.' },
        { id: 1, start: 10.0, end: 20.0, text: 'B.' },
        { id: 2, start: 20.0, end: 30.0, text: 'C.' },
      ];

      // 10s chunks = each segment gets its own chunk
      const chunks = chunkByTime(segments, 10);

      expect(chunks).toHaveLength(3);
    });
  });
});
