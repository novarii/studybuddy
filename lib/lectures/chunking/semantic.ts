/**
 * Semantic chunking for lecture transcripts using LLM topic detection.
 *
 * Uses an LLM to detect topic boundaries via timestamp markers,
 * avoiding the need to echo back verbatim transcript text in JSON.
 * This prevents malformed JSON on long transcripts (~38K+ chars).
 */

import { generateObject } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { z } from 'zod';

import type { WhisperSegment } from '../types';
import type { TimestampedChunk } from './time-based';

/**
 * Model used for semantic chunking.
 * Gemini 2.5 Flash Lite is fast and cheap (~$0.075/1M tokens).
 */
const CHUNKING_MODEL = 'google/gemini-2.5-flash-lite';

/**
 * Zod schema for LLM-generated semantic chunks (timestamp boundaries).
 */
export const SemanticChunksSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().describe('Brief topic title (3-6 words)'),
      start: z.number().describe('Start timestamp in seconds'),
      end: z.number().describe('End timestamp in seconds'),
    })
  ),
});

/**
 * Type for a semantic chunk from LLM (timestamp boundaries only).
 */
export type SemanticChunk = z.infer<typeof SemanticChunksSchema>['chunks'][number];

/**
 * System prompt for the LLM to detect topic boundaries via timestamps.
 */
const CHUNKING_SYSTEM_PROMPT = `You are analyzing a lecture transcript to identify topic boundaries.

The transcript is formatted as timestamped segments:
[0.0] First segment text here
[13.4] Second segment text here
...

Split the transcript into logical chunks where each chunk covers ONE topic or concept.
Return the chunks with:
- title: A brief 3-6 word title for the topic
- start: The timestamp (in seconds) where this topic begins
- end: The timestamp (in seconds) where this topic ends

Important:
- Each chunk should be a coherent topic (not arbitrary time splits)
- Chunks must be contiguous: the first chunk starts at the earliest timestamp, the last chunk ends at the latest timestamp
- Typical chunk length: 1-5 minutes of content
- Look for topic transitions: "Now let's talk about...", "Moving on to...", etc.
- If the transcript is short, it's okay to return just one chunk
- Do NOT include transcript text in your response — only return titles and timestamp boundaries`;

/**
 * Find the index of the segment whose start time is closest to the target.
 */
export function findClosestSegmentIndex(
  segments: WhisperSegment[],
  targetTimestamp: number
): number {
  let closestIndex = 0;
  let closestDiff = Math.abs(segments[0].start - targetTimestamp);

  for (let i = 1; i < segments.length; i++) {
    const diff = Math.abs(segments[i].start - targetTimestamp);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestIndex = i;
    }
  }

  return closestIndex;
}

/**
 * Detect topic boundaries using LLM analysis.
 *
 * @param segments - Whisper segments with timestamps
 * @param apiKey - OpenRouter API key (user's BYOK key)
 * @returns Array of semantic chunks with title and timestamp boundaries
 */
export async function detectTopicBoundaries(
  segments: WhisperSegment[],
  apiKey: string
): Promise<SemanticChunk[]> {
  const openrouter = createOpenRouter({ apiKey });

  // Format segments as timestamped lines
  const prompt = segments
    .map((s) => `[${s.start.toFixed(1)}] ${s.text}`)
    .join('\n');

  const result = await generateObject({
    model: openrouter(CHUNKING_MODEL),
    schema: SemanticChunksSchema,
    system: CHUNKING_SYSTEM_PROMPT,
    prompt,
  });

  return result.object.chunks;
}

/**
 * Resolve LLM timestamp boundaries into full TimestampedChunks
 * by extracting text from the matching WhisperSegments.
 *
 * @param llmChunks - Chunks from LLM with title and timestamp boundaries
 * @param segments - Whisper segments with timestamps and text
 * @returns Timestamped chunks ready for embedding
 */
export function resolveChunksFromTimestamps(
  llmChunks: SemanticChunk[],
  segments: WhisperSegment[]
): TimestampedChunk[] {
  if (llmChunks.length === 0 || segments.length === 0) {
    return [];
  }

  const results: TimestampedChunk[] = [];

  for (let chunkIndex = 0; chunkIndex < llmChunks.length; chunkIndex++) {
    const chunk = llmChunks[chunkIndex];
    const isLastChunk = chunkIndex === llmChunks.length - 1;

    const startIdx = findClosestSegmentIndex(segments, chunk.start);

    let endIdx: number;
    if (isLastChunk) {
      // Last chunk always extends to the final segment
      endIdx = segments.length - 1;
    } else {
      // Use the next chunk's start to find where this chunk ends.
      // The segment at the next chunk's start belongs to the next chunk,
      // so this chunk ends at the segment just before it.
      const nextStartIdx = findClosestSegmentIndex(
        segments,
        llmChunks[chunkIndex + 1].start
      );
      endIdx = Math.max(startIdx, nextStartIdx - 1);
    }

    const matchedSegments = segments.slice(startIdx, endIdx + 1);

    const text = matchedSegments
      .map((s) => s.text)
      .filter((t) => t.trim().length > 0)
      .join(' ');

    results.push({
      title: chunk.title,
      text,
      start_seconds: matchedSegments[0].start,
      end_seconds: matchedSegments[matchedSegments.length - 1].end,
      chunk_index: chunkIndex,
      segment_ids: matchedSegments.map((s) => s.id),
    });
  }

  return results;
}

/**
 * Perform semantic chunking on transcript segments.
 *
 * @param segments - Normalized Whisper segments
 * @param apiKey - OpenRouter API key for LLM
 * @returns Timestamped chunks with topic titles
 */
export async function chunkBySemantic(
  segments: WhisperSegment[],
  apiKey: string
): Promise<TimestampedChunk[]> {
  if (segments.length === 0) {
    return [];
  }

  // Get topic boundaries from LLM (passing segments directly)
  const llmChunks = await detectTopicBoundaries(segments, apiKey);

  // Resolve timestamp boundaries to full chunks with text
  return resolveChunksFromTimestamps(llmChunks, segments);
}
