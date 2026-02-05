import { describe, it, expect } from 'vitest';

import {
  FILLER_WORDS,
  removeFillerWords,
  detectGarbage,
  normalizeSegment,
  normalizeTranscript,
} from '@/lib/lectures/normalize';
import type { WhisperSegment } from '@/lib/lectures/types';

describe('Transcript Normalization', () => {
  describe('FILLER_WORDS', () => {
    it('should include common English filler words', () => {
      const expectedFillers = ['okay', 'ok', 'um', 'uh', 'like', 'you know', 'so', 'right'];
      for (const filler of expectedFillers) {
        expect(FILLER_WORDS).toContain(filler);
      }
    });
  });

  describe('removeFillerWords', () => {
    it('should remove single filler words at word boundaries', () => {
      expect(removeFillerWords('Um, hello there.')).toBe('hello there.');
      expect(removeFillerWords('Hello, um, how are you?')).toBe('Hello, how are you?');
      expect(removeFillerWords('That is okay.')).toBe('That is');
    });

    it('should remove filler words case-insensitively', () => {
      expect(removeFillerWords('UM hello UM')).toBe('hello');
      expect(removeFillerWords('OKAY, let us start')).toBe('let us start');
      expect(removeFillerWords('Like, I was saying')).toBe('I was saying');
    });

    it('should remove multiple filler words in sequence', () => {
      expect(removeFillerWords('Um, uh, like, you know, the thing')).toBe('the thing');
    });

    it('should preserve meaningful words containing filler substrings', () => {
      // "like" shouldn't affect "likely" or "dislike"
      expect(removeFillerWords('I likely agree')).toBe('I likely agree');
      expect(removeFillerWords('I dislike that')).toBe('I dislike that');
      // "um" shouldn't affect "umbrella"
      expect(removeFillerWords('Get the umbrella')).toBe('Get the umbrella');
      // "ok" shouldn't affect "broken" or "token"
      expect(removeFillerWords('The token is broken')).toBe('The token is broken');
    });

    it('should remove trailing punctuation after filler words', () => {
      expect(removeFillerWords('Okay, so today')).toBe('today');
      expect(removeFillerWords('Um. What I meant was')).toBe('What I meant was');
    });

    it('should handle empty and whitespace-only strings', () => {
      expect(removeFillerWords('')).toBe('');
      expect(removeFillerWords('   ')).toBe('');
      expect(removeFillerWords('um')).toBe('');
    });

    it('should collapse multiple spaces into one', () => {
      expect(removeFillerWords('Hello   um   world')).toBe('Hello world');
    });

    it('should handle text with only filler words', () => {
      expect(removeFillerWords('um uh like okay')).toBe('');
      expect(removeFillerWords('So, um, yeah, okay.')).toBe('');
    });

    it('should handle multi-word fillers', () => {
      expect(removeFillerWords('I mean, you know, it is great')).toBe('it is great');
      expect(removeFillerWords('All right, let us begin')).toBe('let us begin');
    });
  });

  describe('detectGarbage', () => {
    it('should detect repeated phrases (3+ times)', () => {
      // Same phrase repeated 3+ times indicates hallucination
      expect(detectGarbage('hello world hello world hello world')).toBe(true);
      expect(detectGarbage('testing testing testing testing')).toBe(true);
    });

    it('should not flag short or non-repeated text', () => {
      expect(detectGarbage('Hello, welcome to the lecture.')).toBe(false);
      expect(detectGarbage('This is a normal sentence about programming.')).toBe(false);
    });

    it('should not flag text with natural repetition', () => {
      // Short repeats like "the the" shouldn't trigger (phrase must be 10+ chars)
      expect(detectGarbage('I went to the the store')).toBe(false);
      expect(detectGarbage('yes yes yes')).toBe(false);
    });

    it('should detect garbage with varied case', () => {
      expect(detectGarbage('Testing Testing Testing Testing')).toBe(true);
    });

    it('should handle empty strings', () => {
      expect(detectGarbage('')).toBe(false);
    });

    it('should detect repetition with slight variations', () => {
      // The regex checks for exact repetition of 10+ char phrases
      const repeatedPhrase = 'This is garbage. This is garbage. This is garbage.';
      expect(detectGarbage(repeatedPhrase)).toBe(true);
    });
  });

  describe('normalizeSegment', () => {
    it('should clean filler words from segment text', () => {
      const segment: WhisperSegment = {
        id: 0,
        start: 0.0,
        end: 5.0,
        text: 'Um, okay, so today we will talk about algorithms.',
      };

      const normalized = normalizeSegment(segment);

      expect(normalized.text).toBe('today we will talk about algorithms.');
      expect(normalized.id).toBe(0);
      expect(normalized.start).toBe(0.0);
      expect(normalized.end).toBe(5.0);
    });

    it('should mark garbage segments with empty text', () => {
      const segment: WhisperSegment = {
        id: 1,
        start: 5.0,
        end: 10.0,
        text: 'hello world hello world hello world',
      };

      const normalized = normalizeSegment(segment);

      expect(normalized.text).toBe('');
      expect(normalized.id).toBe(1);
      expect(normalized.start).toBe(5.0);
      expect(normalized.end).toBe(10.0);
    });

    it('should preserve valid segments unchanged (except filler removal)', () => {
      const segment: WhisperSegment = {
        id: 2,
        start: 10.0,
        end: 15.5,
        text: 'This is a perfectly normal lecture segment.',
      };

      const normalized = normalizeSegment(segment);

      expect(normalized.text).toBe('This is a perfectly normal lecture segment.');
    });

    it('should handle segments that become empty after filler removal', () => {
      const segment: WhisperSegment = {
        id: 3,
        start: 15.5,
        end: 16.0,
        text: 'Um, uh, okay.',
      };

      const normalized = normalizeSegment(segment);

      expect(normalized.text).toBe('');
    });
  });

  describe('normalizeTranscript', () => {
    it('should normalize all segments in transcript', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 3.0, text: 'Um, hello everyone.' },
        { id: 1, start: 3.0, end: 6.0, text: 'Today we will discuss algorithms.' },
        { id: 2, start: 6.0, end: 9.0, text: 'So, like, sorting is important.' },
      ];

      const normalized = normalizeTranscript(segments);

      expect(normalized).toHaveLength(3);
      expect(normalized[0].text).toBe('hello everyone.');
      expect(normalized[1].text).toBe('Today we will discuss algorithms.');
      expect(normalized[2].text).toBe('sorting is important.');
    });

    it('should preserve segment order and IDs', () => {
      const segments: WhisperSegment[] = [
        { id: 5, start: 0.0, end: 2.0, text: 'First segment.' },
        { id: 10, start: 2.0, end: 4.0, text: 'Second segment.' },
        { id: 15, start: 4.0, end: 6.0, text: 'Third segment.' },
      ];

      const normalized = normalizeTranscript(segments);

      expect(normalized[0].id).toBe(5);
      expect(normalized[1].id).toBe(10);
      expect(normalized[2].id).toBe(15);
    });

    it('should handle empty segment array', () => {
      const normalized = normalizeTranscript([]);
      expect(normalized).toHaveLength(0);
    });

    it('should preserve timestamps exactly', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.123, end: 1.456, text: 'Um, test.' },
        { id: 1, start: 1.456, end: 2.789, text: 'Okay, another test.' },
      ];

      const normalized = normalizeTranscript(segments);

      expect(normalized[0].start).toBe(0.123);
      expect(normalized[0].end).toBe(1.456);
      expect(normalized[1].start).toBe(1.456);
      expect(normalized[1].end).toBe(2.789);
    });

    it('should filter out garbage segments by marking them empty', () => {
      const segments: WhisperSegment[] = [
        { id: 0, start: 0.0, end: 3.0, text: 'Hello everyone.' },
        { id: 1, start: 3.0, end: 6.0, text: 'garbage text garbage text garbage text' },
        { id: 2, start: 6.0, end: 9.0, text: 'Back to normal content.' },
      ];

      const normalized = normalizeTranscript(segments);

      expect(normalized[0].text).toBe('Hello everyone.');
      expect(normalized[1].text).toBe(''); // Garbage marked empty
      expect(normalized[2].text).toBe('Back to normal content.');
    });
  });
});
