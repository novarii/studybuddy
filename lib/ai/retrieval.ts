import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { embed } from './embeddings';
import type {
  SearchOptions,
  SearchResult,
  RetrievalResult,
  SlideSearchResult,
  LectureSearchResult,
} from './types';
import type { RAGSource } from '@/types';

/**
 * Format seconds into a human-readable timestamp (MM:SS or HH:MM:SS).
 */
export function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/**
 * Order chunks by type and chronologically within type.
 * Slides come first (sorted by slide number), then lectures (sorted by start time).
 */
function orderChunks(results: RetrievalResult[]): RetrievalResult[] {
  const slides = results.filter((r): r is RetrievalResult & { type: 'slide' } => r.type === 'slide');
  const lectures = results.filter((r): r is RetrievalResult & { type: 'lecture' } => r.type === 'lecture');

  slides.sort((a, b) => {
    // Sort by document ID first, then by slide number
    if (a.documentId !== b.documentId) {
      return a.documentId.localeCompare(b.documentId);
    }
    return a.slideNumber - b.slideNumber;
  });

  lectures.sort((a, b) => {
    // Sort by lecture ID first, then by start time
    if (a.lectureId !== b.lectureId) {
      return a.lectureId.localeCompare(b.lectureId);
    }
    return a.startSeconds - b.startSeconds;
  });

  return [...slides, ...lectures];
}

/**
 * Format retrieval results into context string and source metadata.
 *
 * This is a pure function that transforms search results into:
 * 1. A numbered context string for the LLM
 * 2. Rich source metadata for the frontend
 */
export function formatRetrievalContext(results: RetrievalResult[]): SearchResult {
  if (results.length === 0) {
    return { context: '', sources: [] };
  }

  const ordered = orderChunks(results);
  const sources: RAGSource[] = [];
  const contextParts: string[] = [];

  ordered.forEach((result, index) => {
    const chunkNumber = index + 1;

    if (result.type === 'slide') {
      const sourceHint = `Slide ${result.slideNumber}`;
      contextParts.push(`[${chunkNumber}] (${sourceHint}) ${result.content}`);

      sources.push({
        source_id: `slide-${result.documentId}-${result.slideNumber}`,
        source_type: 'slide',
        content_preview: result.content.slice(0, 200),
        chunk_number: chunkNumber,
        document_id: result.documentId,
        slide_number: result.slideNumber,
        course_id: result.courseId,
        title: result.title ?? undefined,
      });
    } else {
      const timestamp = formatTimestamp(result.startSeconds);
      const sourceHint = `Lecture @${timestamp}`;
      contextParts.push(`[${chunkNumber}] (${sourceHint}) ${result.content}`);

      sources.push({
        source_id: `lecture-${result.lectureId}-${result.startSeconds}`,
        source_type: 'lecture',
        content_preview: result.content.slice(0, 200),
        chunk_number: chunkNumber,
        lecture_id: result.lectureId,
        start_seconds: result.startSeconds,
        end_seconds: result.endSeconds,
        course_id: result.courseId,
        title: result.title ?? undefined,
      });
    }
  });

  return {
    context: contextParts.join('\n\n'),
    sources,
  };
}

interface SlideSearchOptions {
  embedding: number[];
  userId: string;
  courseId: string;
  documentId?: string;
  limit?: number;
}

/**
 * Search slide chunks using pgvector similarity.
 */
async function searchSlides(options: SlideSearchOptions): Promise<SlideSearchResult[]> {
  const { embedding, userId, courseId, documentId, limit = 5 } = options;

  // Format embedding as PostgreSQL vector literal
  const vectorLiteral = `[${embedding.join(',')}]`;

  // Build the query with optional document filter
  const documentFilter = documentId
    ? sql`AND meta_data->>'document_id' = ${documentId}`
    : sql``;

  const results = await db.execute<{
    id: string;
    content: string;
    document_id: string;
    slide_number: number;
    title: string | null;
    course_id: string;
    similarity: number;
  }>(sql`
    SELECT
      id,
      content,
      meta_data->>'document_id' as document_id,
      (meta_data->>'slide_number')::int as slide_number,
      meta_data->>'title' as title,
      meta_data->>'course_id' as course_id,
      1 - (embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM ai.slide_chunks_knowledge
    WHERE meta_data->>'owner_id' = ${userId}
      AND meta_data->>'course_id' = ${courseId}
      ${documentFilter}
    ORDER BY embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${limit}
  `);

  return results.rows.map((r) => ({
    id: r.id,
    content: r.content,
    documentId: r.document_id,
    slideNumber: r.slide_number,
    title: r.title,
    courseId: r.course_id,
    similarity: r.similarity,
  }));
}

interface LectureSearchOptions {
  embedding: number[];
  courseId: string;
  lectureId?: string;
  limit?: number;
}

/**
 * Search lecture chunks using pgvector similarity.
 */
async function searchLectures(options: LectureSearchOptions): Promise<LectureSearchResult[]> {
  const { embedding, courseId, lectureId, limit = 5 } = options;

  // Format embedding as PostgreSQL vector literal
  const vectorLiteral = `[${embedding.join(',')}]`;

  // Build the query with optional lecture filter
  const lectureFilter = lectureId
    ? sql`AND meta_data->>'lecture_id' = ${lectureId}`
    : sql``;

  const results = await db.execute<{
    id: string;
    content: string;
    lecture_id: string;
    start_seconds: number;
    end_seconds: number;
    title: string | null;
    course_id: string;
    similarity: number;
  }>(sql`
    SELECT
      id,
      content,
      meta_data->>'lecture_id' as lecture_id,
      (meta_data->>'start_seconds')::float as start_seconds,
      (meta_data->>'end_seconds')::float as end_seconds,
      meta_data->>'title' as title,
      meta_data->>'course_id' as course_id,
      1 - (embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}) as similarity
    FROM ai.lecture_chunks_knowledge
    WHERE meta_data->>'course_id' = ${courseId}
      ${lectureFilter}
    ORDER BY embedding <=> ${sql.raw(`'${vectorLiteral}'::vector`)}
    LIMIT ${limit}
  `);

  return results.rows.map((r) => ({
    id: r.id,
    content: r.content,
    lectureId: r.lecture_id,
    startSeconds: r.start_seconds,
    endSeconds: r.end_seconds,
    title: r.title,
    courseId: r.course_id,
    similarity: r.similarity,
  }));
}

/**
 * Search knowledge base for relevant slides and lecture transcripts.
 *
 * Uses a dual-retriever strategy:
 * 1. Search slides (per-user, filtered by owner_id)
 * 2. Search lectures (per-course, shared across users)
 *
 * Results are ordered chronologically (slides by number, lectures by timestamp)
 * and formatted with numbered citations for the LLM.
 *
 * @param options - Search options including query and context filters
 * @returns Context string and source metadata for RAG
 */
export async function searchKnowledge(options: SearchOptions): Promise<SearchResult> {
  const { query, userId, courseId, documentId, lectureId, apiKey } = options;

  // Get embedding for the query (uses BYOK key if provided)
  const queryEmbedding = await embed(query, apiKey);

  // Search both knowledge bases in parallel
  const [slideResults, lectureResults] = await Promise.all([
    searchSlides({
      embedding: queryEmbedding,
      userId,
      courseId,
      documentId,
      limit: 5,
    }),
    searchLectures({
      embedding: queryEmbedding,
      courseId,
      lectureId,
      limit: 5,
    }),
  ]);

  // Combine results with type discriminator
  const allResults: RetrievalResult[] = [
    ...slideResults.map((r) => ({ type: 'slide' as const, ...r })),
    ...lectureResults.map((r) => ({ type: 'lecture' as const, ...r })),
  ];

  // Format into context and sources
  return formatRetrievalContext(allResults);
}
