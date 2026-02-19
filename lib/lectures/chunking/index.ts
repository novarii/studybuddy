/**
 * Transcript chunking strategy selector.
 *
 * Provides a unified interface for chunking transcripts, automatically
 * selecting between semantic (LLM-based) and time-based strategies.
 */

import type { WhisperSegment } from '../types';
import { chunkByTime, type TimestampedChunk } from './time-based';
import { chunkBySemantic } from './semantic';

// Re-export types for convenience
export type { TimestampedChunk } from './time-based';
export { chunkByTime } from './time-based';
export { chunkBySemantic, resolveChunksFromTimestamps } from './semantic';

/**
 * Chunk a transcript using the best available strategy.
 *
 * Strategy selection:
 * 1. If API key provided → try semantic chunking (LLM-based topic detection)
 * 2. If semantic fails or no API key → fall back to time-based (180s chunks)
 *
 * @param segments - Normalized Whisper segments with timestamps
 * @param apiKey - Optional OpenRouter API key for semantic chunking
 * @returns Timestamped chunks ready for embedding
 */
export async function chunkTranscript(
  segments: WhisperSegment[],
  apiKey?: string
): Promise<TimestampedChunk[]> {
  // Handle empty input
  if (segments.length === 0) {
    return [];
  }

  // If no API key, use time-based directly
  if (!apiKey) {
    return chunkByTime(segments);
  }

  // Try semantic chunking with retries, then fall back to time-based
  const MAX_RETRIES = 2;
  for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
    try {
      return await chunkBySemantic(segments, apiKey);
    } catch (error) {
      if (attempt <= MAX_RETRIES) {
        console.warn(`Semantic chunking attempt ${attempt} failed, retrying...`, error);
      } else {
        console.warn(`Semantic chunking failed after ${MAX_RETRIES + 1} attempts, falling back to time-based:`, error);
        return chunkByTime(segments);
      }
    }
  }

  // Unreachable, but TypeScript needs it
  return chunkByTime(segments);
}
