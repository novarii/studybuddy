import type { PageResult } from './page-processor';

/**
 * Similarity threshold for deduplication.
 * Pages with Jaccard similarity >= 0.9 (90%) are considered duplicates.
 */
export const SIMILARITY_THRESHOLD = 0.9;

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
