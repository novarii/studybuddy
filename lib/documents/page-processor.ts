import pLimit from 'p-limit';
import { extractPageContent } from './gemini-extractor';

/**
 * Maximum number of concurrent page extraction requests.
 * Balances speed vs rate limits on OpenRouter/Gemini.
 */
export const CONCURRENCY_LIMIT = 5;

/**
 * Number of retry attempts on page extraction failure.
 * After MAX_RETRIES + 1 total attempts, the page is skipped.
 */
export const MAX_RETRIES = 1;

/**
 * Delay in milliseconds before retrying a failed page extraction.
 */
const RETRY_DELAY_MS = 1000;

/**
 * Result of processing a single PDF page.
 */
export interface PageResult {
  /** Zero-based page number */
  pageNumber: number;
  /** Extracted text content, or null if extraction failed */
  content: string | null;
  /** Whether extraction was successful */
  success: boolean;
  /** Error object if extraction failed */
  error?: unknown;
}

/**
 * Process a single page with retry logic.
 *
 * @param pageBytes - The PDF page as a Uint8Array
 * @param pageNumber - Zero-based page number for tracking
 * @param apiKey - OpenRouter API key
 * @returns PageResult with extracted content or error info
 */
export async function processPageWithRetry(
  pageBytes: Uint8Array,
  pageNumber: number,
  apiKey: string
): Promise<PageResult> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const content = await extractPageContent(pageBytes, apiKey);
      return { pageNumber, content, success: true };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error(`Page ${pageNumber} failed after ${MAX_RETRIES + 1} attempts:`, error);
        return { pageNumber, content: null, success: false, error };
      }
      // Wait before retry
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }

  // This should never be reached, but TypeScript needs it
  return { pageNumber, content: null, success: false };
}

/**
 * Process multiple PDF pages in parallel with concurrency control.
 *
 * Pages are processed up to CONCURRENCY_LIMIT at a time.
 * Each page gets MAX_RETRIES retry attempts on failure.
 * Failed pages are logged but don't stop the pipeline.
 *
 * @param pages - Array of single-page PDF Uint8Arrays
 * @param apiKey - OpenRouter API key (user's BYOK key or shared key)
 * @returns Array of PageResults in the same order as input pages
 */
export async function processPages(
  pages: Uint8Array[],
  apiKey: string
): Promise<PageResult[]> {
  if (pages.length === 0) {
    return [];
  }

  const limit = pLimit(CONCURRENCY_LIMIT);

  const results = await Promise.all(
    pages.map((page, index) =>
      limit(() => processPageWithRetry(page, index, apiKey))
    )
  );

  return results;
}
