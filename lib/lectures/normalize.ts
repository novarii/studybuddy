/**
 * Transcript normalization for lecture processing.
 *
 * Cleans Whisper transcription output by removing filler words and
 * detecting garbage (repeated phrases from hallucinations).
 */

import type { WhisperSegment } from './types';

/**
 * Common English filler words to remove from transcripts.
 * These don't contribute to semantic meaning and hurt embedding quality.
 */
export const FILLER_WORDS = [
  'okay',
  'ok',
  'um',
  'uh',
  'uhm',
  'umm',
  'hmm',
  'like',
  'you know',
  'i mean',
  'so',
  'right',
  'alright',
  'all right',
  'yeah',
  'yep',
  'mhm',
];

/**
 * Common Whisper hallucinations that appear during silence or at segment boundaries.
 * These should be removed entirely from transcripts.
 */
export const WHISPER_HALLUCINATIONS = [
  'thank you',
  'thanks',
  'thanks for watching',
  'thanks for listening',
  'bye',
  'goodbye',
  'see you next time',
  'see you',
  'i have no clue what that is',
  'subscribe',
  'like and subscribe',
];

/**
 * Remove filler words and hallucinations from text while preserving meaningful content.
 *
 * - Matches filler words at word boundaries only (won't affect "likely", "umbrella")
 * - Case-insensitive matching
 * - Removes trailing punctuation after fillers
 * - Collapses multiple spaces
 */
export function removeFillerWords(text: string): string {
  let result = text;

  // Combine fillers and hallucinations, sort by length descending to match multi-word phrases first
  const allFillers = [...FILLER_WORDS, ...WHISPER_HALLUCINATIONS].sort(
    (a, b) => b.length - a.length
  );

  for (const filler of allFillers) {
    // Escape special regex characters in filler
    const escaped = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // Match filler at word boundary, followed by optional punctuation and whitespace
    const regex = new RegExp(`\\b${escaped}\\b[,.]?\\s*`, 'gi');
    result = result.replace(regex, ' ');
  }

  // Collapse multiple spaces and trim
  return result.replace(/\s+/g, ' ').trim();
}

/**
 * Detect garbage content (repeated phrases indicating Whisper hallucination).
 *
 * Whisper sometimes outputs repeated phrases when audio is unclear.
 * This detects phrases repeated 3+ times in the text.
 */
export function detectGarbage(text: string): boolean {
  if (!text || text.length < 30) {
    return false;
  }

  const lowerText = text.toLowerCase();

  // Split into words and look for repeated n-grams (1-5 words)
  const words = lowerText.split(/\s+/).filter((w) => w.length > 0);

  if (words.length < 4) {
    return false;
  }

  // Check for repeated phrases of 1-5 words
  for (let phraseLen = 1; phraseLen <= Math.min(5, Math.floor(words.length / 3)); phraseLen++) {
    const phraseCounts = new Map<string, number>();

    for (let i = 0; i <= words.length - phraseLen; i++) {
      const phrase = words.slice(i, i + phraseLen).join(' ');
      // Only count phrases with enough content (at least 5 chars for single words)
      if (phraseLen === 1 && phrase.length < 5) {
        continue;
      }
      phraseCounts.set(phrase, (phraseCounts.get(phrase) || 0) + 1);
    }

    // If any phrase appears 3+ times, it's likely garbage
    for (const count of phraseCounts.values()) {
      if (count >= 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Normalize a single Whisper segment.
 *
 * - Removes filler words
 * - Marks garbage segments with empty text
 * - Preserves original timestamps
 */
export function normalizeSegment(segment: WhisperSegment): WhisperSegment {
  const cleaned = removeFillerWords(segment.text);
  const isGarbage = detectGarbage(cleaned);

  return {
    ...segment,
    text: isGarbage ? '' : cleaned,
  };
}

/**
 * Normalize all segments in a transcript.
 *
 * Applies normalization to each segment while preserving order,
 * IDs, and timestamps. Garbage segments are marked with empty text.
 */
export function normalizeTranscript(segments: WhisperSegment[]): WhisperSegment[] {
  return segments.map(normalizeSegment);
}
