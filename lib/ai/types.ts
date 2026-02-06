/**
 * AI-related types for the RAG system.
 *
 * These types are used by the retrieval and embedding services.
 */

/**
 * RAG source for frontend display with citation metadata.
 * Re-exported from the main types for convenience.
 */
export type { RAGSource } from '@/types';

/**
 * Search options for knowledge retrieval.
 */
export interface SearchOptions {
  query: string;
  userId: string;
  courseId: string;
  documentId?: string;
  lectureId?: string;
  apiKey?: string;
}

/**
 * Result from a knowledge search operation.
 */
export interface SearchResult {
  /** Formatted context string for the LLM with numbered citations */
  context: string;
  /** Rich source metadata for frontend display */
  sources: import('@/types').RAGSource[];
}

/**
 * Raw result from a slide chunk search.
 */
export interface SlideSearchResult {
  id: string;
  content: string;
  documentId: string;
  slideNumber: number;
  title: string | null;
  courseId: string;
  similarity: number;
}

/**
 * Raw result from a lecture chunk search.
 */
export interface LectureSearchResult {
  id: string;
  content: string;
  lectureId: string;
  startSeconds: number;
  endSeconds: number;
  title: string | null;
  courseId: string;
  similarity: number;
}

/**
 * Combined retrieval result before formatting.
 */
export type RetrievalResult =
  | ({ type: 'slide' } & SlideSearchResult)
  | ({ type: 'lecture' } & LectureSearchResult);

/**
 * OpenRouter embedding API response shape.
 */
export interface EmbeddingResponse {
  data: Array<{
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}
