/**
 * Time-based chunking for lecture transcripts.
 *
 * Groups Whisper segments into fixed-duration chunks (default 180s).
 * This is the fallback strategy when semantic chunking fails.
 */

import type { WhisperSegment } from '../types';

/**
 * A timestamped chunk ready for embedding.
 */
export interface TimestampedChunk {
  /** Brief topic title */
  title: string;
  /** Combined text from segments */
  text: string;
  /** Start time in seconds */
  start_seconds: number;
  /** End time in seconds */
  end_seconds: number;
  /** Index of this chunk (0-based) */
  chunk_index: number;
  /** IDs of Whisper segments in this chunk */
  segment_ids: number[];
}

/**
 * Default chunk duration in seconds (3 minutes).
 */
export const DEFAULT_CHUNK_DURATION = 180;

/**
 * Group segments into chunks of approximately the target duration.
 *
 * @param segments - Whisper segments with timestamps
 * @param targetDurationSeconds - Target duration per chunk (default: 180s)
 * @returns Array of timestamped chunks
 */
export function chunkByTime(
  segments: WhisperSegment[],
  targetDurationSeconds: number = DEFAULT_CHUNK_DURATION
): TimestampedChunk[] {
  if (segments.length === 0) {
    return [];
  }

  const chunks: TimestampedChunk[] = [];
  let currentChunkSegments: WhisperSegment[] = [];
  let chunkStartTime = segments[0].start;

  for (const segment of segments) {
    const currentDuration = segment.end - chunkStartTime;

    // If adding this segment exceeds target duration and we have segments,
    // finish the current chunk (but always include at least one segment)
    if (
      currentDuration > targetDurationSeconds &&
      currentChunkSegments.length > 0
    ) {
      chunks.push(createChunk(currentChunkSegments, chunks.length));
      currentChunkSegments = [];
      chunkStartTime = segment.start;
    }

    currentChunkSegments.push(segment);
  }

  // Don't forget the last chunk
  if (currentChunkSegments.length > 0) {
    chunks.push(createChunk(currentChunkSegments, chunks.length));
  }

  return chunks;
}

/**
 * Create a chunk from a group of segments.
 */
function createChunk(
  segments: WhisperSegment[],
  index: number
): TimestampedChunk {
  // Concatenate non-empty segment texts with spaces
  const text = segments
    .map((s) => s.text)
    .filter((t) => t.trim().length > 0)
    .join(' ');

  return {
    title: `Part ${index + 1}`,
    text,
    start_seconds: segments[0].start,
    end_seconds: segments[segments.length - 1].end,
    chunk_index: index,
    segment_ids: segments.map((s) => s.id),
  };
}
