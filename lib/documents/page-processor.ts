import { appendFileSync, writeFileSync } from 'fs';
import pLimit from 'p-limit';
import { extractPageContent } from './gemini-extractor';

/**
 * Log file path for debugging LLM extraction output.
 * Set DOCUMENT_DEBUG_LOG env var to enable logging.
 */
const DEBUG_LOG_PATH = process.env.DOCUMENT_DEBUG_LOG || '';

/**
 * Maximum number of concurrent page extraction requests.
 */
export const CONCURRENCY_LIMIT = 5;

/**
 * Number of retry attempts on page extraction failure.
 * After MAX_RETRIES + 1 total attempts, the page is skipped.
 */
export const MAX_RETRIES = 3;

/**
 * Base delay in milliseconds before retrying (exponential backoff).
 * Actual delay = BASE_RETRY_DELAY_MS * 2^attempt
 */
const BASE_RETRY_DELAY_MS = 2000;

/**
 * Delay between successful requests to avoid rate limiting.
 */
const REQUEST_DELAY_MS = 500;

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

      // Debug logging if enabled
      if (DEBUG_LOG_PATH) {
        const logEntry = `\n${'='.repeat(60)}\nPAGE ${pageNumber + 1}\n${'='.repeat(60)}\n${content}\n`;
        appendFileSync(DEBUG_LOG_PATH, logEntry);
      }

      // Small delay after success to avoid rate limiting
      await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));

      return { pageNumber, content, success: true };
    } catch (error) {
      if (attempt === MAX_RETRIES) {
        console.error(`Page ${pageNumber} failed after ${MAX_RETRIES + 1} attempts:`, error);
        return { pageNumber, content: null, success: false, error };
      }
      // Exponential backoff: 2s, 4s, 8s
      const delay = BASE_RETRY_DELAY_MS * Math.pow(2, attempt);
      console.warn(`Page ${pageNumber} attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
      await new Promise((r) => setTimeout(r, delay));
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

  // Clear debug log at start of new document
  if (DEBUG_LOG_PATH) {
    writeFileSync(DEBUG_LOG_PATH, `LLM Extraction Log - ${new Date().toISOString()}\nTotal pages: ${pages.length}\n`);
  }

  const limit = pLimit(CONCURRENCY_LIMIT);

  const results = await Promise.all(
    pages.map((page, index) =>
      limit(() => processPageWithRetry(page, index, apiKey))
    )
  );

  return results;
}
