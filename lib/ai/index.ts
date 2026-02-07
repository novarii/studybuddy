/**
 * AI module exports.
 *
 * This module provides:
 * - embed/embedBatch: OpenRouter embedding functions
 * - searchKnowledge: RAG retrieval with pgvector
 * - formatRetrievalContext: Pure function for formatting search results
 * - SYSTEM_PROMPT: Default system prompt for the chat agent
 */

export { embed, embedBatch } from './embeddings';
export {
  searchKnowledge,
  formatRetrievalContext,
  formatTimestamp,
} from './retrieval';
export { SYSTEM_PROMPT } from './prompts';
export {
  shouldCompact,
  buildSummarySystemMessage,
  compactMessages,
} from './compaction';
export type {
  SearchOptions,
  SearchResult,
  RetrievalResult,
  SlideSearchResult,
  LectureSearchResult,
  EmbeddingResponse,
} from './types';
