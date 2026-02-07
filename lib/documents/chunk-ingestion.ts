import { sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { formatVectorLiteral } from '@/lib/db/vector-utils';
import { embedBatch } from '@/lib/ai/embeddings';
import type { PageResult } from './page-processor';

/**
 * Data structure for a chunk ready for database insertion.
 */
export interface ChunkData {
  /** Text content of the chunk (extracted page content) */
  content: string;
  /** Embedding vector for the content */
  embedding: number[];
  /** Zero-based page number from the original PDF */
  pageNumber: number;
}

/**
 * Options for inserting chunks into the database.
 */
export interface InsertChunksOptions {
  /** Document ID this chunk belongs to */
  documentId: string;
  /** Course ID for filtering in RAG queries */
  courseId: string;
  /** User ID (owner) for access control */
  userId: string;
  /** Original filename for reference */
  filename: string;
}

/**
 * Generate embeddings for page contents in batch.
 *
 * Uses OpenRouter's embedding API to generate vectors for all pages.
 * Pages should be pre-filtered to only include successful extractions
 * with non-null content.
 *
 * @param pages - Array of page results with content
 * @param apiKey - OpenRouter API key (user's BYOK key or shared)
 * @returns Array of embedding vectors in the same order as input
 */
export async function generateChunkEmbeddings(
  pages: PageResult[],
  apiKey: string
): Promise<number[][]> {
  if (pages.length === 0) {
    return [];
  }

  // Extract content from pages (should all be non-null after filtering)
  const contents = pages.map((p) => p.content!);

  return embedBatch(contents, apiKey);
}

/**
 * Insert chunks into the slide_chunks_knowledge table.
 *
 * Each chunk represents one unique page from a document.
 * Metadata includes document ID, slide number, course ID, and owner ID
 * for filtering during RAG retrieval.
 *
 * @param chunks - Array of chunk data to insert
 * @param options - Document and ownership metadata
 */
export async function insertChunks(
  chunks: ChunkData[],
  options: InsertChunksOptions
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  const { documentId, courseId, userId, filename } = options;

  // Build VALUES clause for batch insert
  // Each row: (content, meta_data, embedding)
  const values = chunks.map((chunk) => {
    const metadata = {
      document_id: documentId,
      slide_number: chunk.pageNumber + 1, // 1-based for user display
      course_id: courseId,
      owner_id: userId,
      title: filename,
    };

    // Format and validate embedding as PostgreSQL vector literal
    const vectorLiteral = formatVectorLiteral(chunk.embedding);

    return sql`(
      ${chunk.content},
      ${JSON.stringify(metadata)}::jsonb,
      ${sql.raw(`'${vectorLiteral}'::vector`)}
    )`;
  });

  // Execute batch insert
  await db.execute(sql`
    INSERT INTO ai.slide_chunks_knowledge (content, meta_data, embedding)
    VALUES ${sql.join(values, sql`, `)}
  `);
}

/**
 * Convenience function to prepare chunks from page results and embeddings.
 *
 * Combines page results with their corresponding embeddings into
 * ChunkData objects ready for database insertion.
 *
 * @param pages - Array of unique page results
 * @param embeddings - Array of embeddings in the same order
 * @returns Array of ChunkData objects
 */
export function prepareChunks(
  pages: PageResult[],
  embeddings: number[][]
): ChunkData[] {
  if (pages.length !== embeddings.length) {
    throw new Error(
      `Mismatch: ${pages.length} pages but ${embeddings.length} embeddings`
    );
  }

  return pages.map((page, index) => ({
    content: page.content!,
    embedding: embeddings[index],
    pageNumber: page.pageNumber,
  }));
}
