import type { PageResult } from './page-processor';

/**
 * Similarity threshold for Jaccard deduplication (legacy).
 * Pages with Jaccard similarity >= 0.9 (90%) are considered duplicates.
 */
export const SIMILARITY_THRESHOLD = 0.9;

/**
 * Similarity threshold for cosine deduplication on embeddings.
 * Pages with cosine similarity >= 0.95 (95%) are considered duplicates.
 * Higher threshold than Jaccard because embeddings are more precise.
 */
export const COSINE_SIMILARITY_THRESHOLD = 0.95;

/**
 * Calculate cosine similarity between two embedding vectors.
 *
 * Cosine similarity = (A · B) / (||A|| * ||B||)
 *
 * Returns a value between -1 and 1, where 1 means identical direction.
 * For normalized embeddings (like OpenAI's), this is equivalent to dot product.
 *
 * @param a - First embedding vector
 * @param b - Second embedding vector
 * @returns Similarity score between -1 and 1
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector length mismatch: ${a.length} vs ${b.length}`);
  }

  if (a.length === 0) {
    return 1; // Empty vectors are considered identical
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;

  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(magA) * Math.sqrt(magB);

  // Handle zero vectors
  if (magnitude === 0) {
    return 1; // Both zero vectors are considered identical
  }

  return dot / magnitude;
}

/**
 * Normalize text for Jaccard similarity comparison.
 * - Converts to lowercase
 * - Removes punctuation and special characters
 * - Splits on whitespace
 * - Filters empty strings
 *
 * @param text - Input text to normalize
 * @returns Array of normalized words
 */
function normalizeText(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Calculate Jaccard similarity between two texts.
 *
 * Jaccard similarity = |A ∩ B| / |A ∪ B|
 *
 * Where A and B are sets of words from each text.
 * Returns a value between 0 (no overlap) and 1 (identical).
 *
 * @param a - First text
 * @param b - Second text
 * @returns Similarity score between 0 and 1
 */
export function jaccardSimilarity(a: string, b: string): number {
  const wordsA = normalizeText(a);
  const wordsB = normalizeText(b);

  const setA = new Set(wordsA);
  const setB = new Set(wordsB);

  // Handle edge case: both sets empty (identical)
  if (setA.size === 0 && setB.size === 0) {
    return 1;
  }

  // Handle edge case: one set empty, other non-empty
  if (setA.size === 0 || setB.size === 0) {
    return 0;
  }

  // Calculate intersection
  const intersection = new Set([...setA].filter((x) => setB.has(x)));

  // Calculate union
  const union = new Set([...setA, ...setB]);

  return intersection.size / union.size;
}

/**
 * Result of deduplication process.
 */
export interface DeduplicationResult {
  /** Pages that are unique (not duplicates of earlier pages) */
  unique: PageResult[];
  /** Page numbers (indices) of duplicate pages */
  duplicateIndices: number[];
}

/**
 * Deduplicate page results based on content similarity.
 *
 * Iterates through pages in order, comparing each to already-seen unique pages.
 * Pages with Jaccard similarity >= SIMILARITY_THRESHOLD (90%) to any unique page
 * are marked as duplicates.
 *
 * Failed pages (success: false) are skipped entirely - they won't be in
 * unique results or duplicate indices.
 *
 * @param results - Array of page extraction results
 * @returns Object with unique pages and duplicate page indices
 */
export function deduplicatePages(results: PageResult[]): DeduplicationResult {
  const unique: PageResult[] = [];
  const duplicateIndices: number[] = [];

  for (const result of results) {
    // Skip failed pages - don't include in unique or duplicates
    if (!result.success || !result.content) {
      continue;
    }

    // Check if this page is a duplicate of any already-seen unique page
    const isDuplicate = unique.some(
      (u) =>
        u.content !== null &&
        jaccardSimilarity(u.content, result.content!) >= SIMILARITY_THRESHOLD
    );

    if (isDuplicate) {
      duplicateIndices.push(result.pageNumber);
    } else {
      unique.push(result);
    }
  }

  return { unique, duplicateIndices };
}

/**
 * Result of embedding-based deduplication process.
 */
export interface EmbeddingDeduplicationResult {
  /** Indices of unique pages (not duplicates of earlier pages) */
  uniqueIndices: number[];
  /** Indices of duplicate pages */
  duplicateIndices: number[];
}

/**
 * Deduplicate pages based on embedding cosine similarity.
 *
 * This approach is more accurate than text-based Jaccard similarity
 * because embeddings capture semantic meaning. Two pages with the same
 * content but different wording (e.g., from LLM extraction variance)
 * will have very similar embeddings.
 *
 * Iterates through embeddings in order, comparing each to already-seen
 * unique embeddings. Pages with cosine similarity >= COSINE_SIMILARITY_THRESHOLD
 * (95%) to any unique page are marked as duplicates.
 *
 * @param embeddings - Array of embedding vectors, one per page
 * @param threshold - Similarity threshold (default: COSINE_SIMILARITY_THRESHOLD)
 * @returns Object with unique and duplicate page indices
 */
export function deduplicateByEmbeddings(
  embeddings: number[][],
  threshold: number = COSINE_SIMILARITY_THRESHOLD
): EmbeddingDeduplicationResult {
  const uniqueIndices: number[] = [];
  const duplicateIndices: number[] = [];
  const uniqueEmbeddings: number[][] = [];

  for (let i = 0; i < embeddings.length; i++) {
    const embedding = embeddings[i];

    // Check if this embedding is a duplicate of any already-seen unique embedding
    const isDuplicate = uniqueEmbeddings.some(
      (u) => cosineSimilarity(u, embedding) >= threshold
    );

    if (isDuplicate) {
      duplicateIndices.push(i);
    } else {
      uniqueIndices.push(i);
      uniqueEmbeddings.push(embedding);
    }
  }

  return { uniqueIndices, duplicateIndices };
}
