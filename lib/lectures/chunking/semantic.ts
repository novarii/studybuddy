/**
 * Semantic chunking for lecture transcripts using LLM topic detection.
 *
 * Uses an LLM to detect topic boundaries in transcripts, producing
 * more meaningful chunks than time-based splitting.
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
 * Zod schema for LLM-generated semantic chunks.
 */
export const SemanticChunksSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().describe('Brief topic title (3-6 words)'),
      text: z.string().describe('The verbatim transcript text for this topic'),
    })
  ),
});

/**
 * Type for a semantic chunk from LLM (before timestamp matching).
 */
export type SemanticChunk = z.infer<typeof SemanticChunksSchema>['chunks'][number];

/**
 * Prompt for the LLM to detect topic boundaries.
 */
const CHUNKING_PROMPT = `You are analyzing a lecture transcript to identify topic boundaries.

Split the transcript into logical chunks where each chunk covers ONE topic or concept.
Return the chunks with:
- title: A brief 3-6 word title for the topic
- text: The EXACT verbatim text from the transcript (do not paraphrase)

Important:
- Each chunk should be a coherent topic (not arbitrary time splits)
- Preserve the exact wording from the transcript
- Typical chunk length: 1-5 minutes of content
- Look for topic transitions: "Now let's talk about...", "Moving on to...", etc.
- If the transcript is short, it's okay to return just one chunk

Transcript:
`;

/**
 * Calculate text similarity between two strings (0.0 to 1.0).
 * Uses word overlap (Jaccard-like similarity).
 */
export function textSimilarity(text1: string, text2: string): number {
  // Handle empty strings
  if (!text1 && !text2) return 1.0;
  if (!text1 || !text2) return 0.0;

  // Normalize: lowercase and split into words
  const normalize = (text: string) =>
    text
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 0);

  const words1 = new Set(normalize(text1));
  const words2 = new Set(normalize(text2));

  if (words1.size === 0 && words2.size === 0) return 1.0;
  if (words1.size === 0 || words2.size === 0) return 0.0;

  // Count intersection
  let intersection = 0;
  for (const word of words1) {
    if (words2.has(word)) {
      intersection++;
    }
  }

  // Jaccard similarity: intersection / union
  const union = words1.size + words2.size - intersection;
  return intersection / union;
}

/**
 * Detect topic boundaries using LLM analysis.
 *
 * @param transcriptText - The full transcript text
 * @param apiKey - OpenRouter API key (user's BYOK key)
 * @returns Array of semantic chunks with title and text
 */
export async function detectTopicBoundaries(
  transcriptText: string,
  apiKey: string
): Promise<SemanticChunk[]> {
  const openrouter = createOpenRouter({ apiKey });

  const result = await generateObject({
    model: openrouter(CHUNKING_MODEL),
    schema: SemanticChunksSchema,
    prompt: CHUNKING_PROMPT + transcriptText,
  });

  return result.object.chunks;
}

/**
 * Match LLM-generated chunks to Whisper segments for accurate timestamps.
 *
 * Uses greedy text accumulation to find segment boundaries that
 * correspond to each LLM chunk.
 *
 * @param llmChunks - Chunks from LLM with title and text
 * @param whisperSegments - Segments from Whisper with timestamps
 * @returns Timestamped chunks ready for embedding
 */
export function matchChunksToTimestamps(
  llmChunks: SemanticChunk[],
  whisperSegments: WhisperSegment[]
): TimestampedChunk[] {
  if (llmChunks.length === 0 || whisperSegments.length === 0) {
    return [];
  }

  const results: TimestampedChunk[] = [];
  let segmentIndex = 0;

  for (let chunkIndex = 0; chunkIndex < llmChunks.length; chunkIndex++) {
    const chunk = llmChunks[chunkIndex];
    const matchedSegments: WhisperSegment[] = [];
    let accumulatedText = '';
    const isLastChunk = chunkIndex === llmChunks.length - 1;

    // For the last chunk, consume all remaining segments
    if (isLastChunk) {
      while (segmentIndex < whisperSegments.length) {
        matchedSegments.push(whisperSegments[segmentIndex]);
        segmentIndex++;
      }
    } else {
      // Greedily match segments until we've covered the chunk text
      while (segmentIndex < whisperSegments.length) {
        const segment = whisperSegments[segmentIndex];
        matchedSegments.push(segment);
        accumulatedText =
          accumulatedText + (accumulatedText ? ' ' : '') + segment.text;

        segmentIndex++;

        // Check if we've matched enough text (using fuzzy similarity)
        const similarity = textSimilarity(accumulatedText.trim(), chunk.text);

        // If similarity is high enough, we've found the boundary
        if (similarity > 0.85) {
          break;
        }

        // Check if adding more text is getting us further from the target
        // (i.e., we've passed the chunk boundary)
        if (matchedSegments.length > 1) {
          const prevText = accumulatedText
            .split(' ')
            .slice(0, -segment.text.split(' ').length)
            .join(' ');
          const prevSimilarity = textSimilarity(prevText.trim(), chunk.text);

          // If similarity is decreasing and was decent, stop
          if (prevSimilarity > 0.7 && similarity < prevSimilarity) {
            // Remove last segment (it belongs to next chunk)
            matchedSegments.pop();
            segmentIndex--; // Rewind to reprocess this segment for next chunk
            break;
          }
        }
      }
    }

    if (matchedSegments.length > 0) {
      results.push({
        title: chunk.title,
        text: chunk.text,
        start_seconds: matchedSegments[0].start,
        end_seconds: matchedSegments[matchedSegments.length - 1].end,
        chunk_index: chunkIndex,
        segment_ids: matchedSegments.map((s) => s.id),
      });
    }
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

  // Combine segment text for LLM analysis
  const transcriptText = segments
    .map((s) => s.text)
    .filter((t) => t.trim().length > 0)
    .join(' ');

  // Get topic boundaries from LLM
  const llmChunks = await detectTopicBoundaries(transcriptText, apiKey);

  // Match chunks back to timestamps
  return matchChunksToTimestamps(llmChunks, segments);
}
