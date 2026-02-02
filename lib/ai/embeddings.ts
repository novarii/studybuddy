import type { EmbeddingResponse } from './types';

/**
 * OpenRouter embeddings endpoint URL.
 */
const OPENROUTER_EMBEDDINGS_URL = 'https://openrouter.ai/api/v1/embeddings';

/**
 * Default embedding model - OpenAI text-embedding-3-small via OpenRouter.
 * Produces 1536-dimensional vectors.
 */
const DEFAULT_MODEL = 'openai/text-embedding-3-small';

/**
 * Generate an embedding vector for the given text using OpenRouter.
 *
 * @param text - The text to embed
 * @param apiKey - Optional API key (defaults to OPENROUTER_API_KEY env var)
 * @returns The embedding vector (1536 dimensions)
 * @throws Error if the API call fails or no API key is available
 */
export async function embed(text: string, apiKey?: string): Promise<number[]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('No API key provided for embeddings');
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const data: EmbeddingResponse = await response.json();
  return data.data[0].embedding;
}

/**
 * Generate embeddings for multiple texts in a single API call.
 *
 * @param texts - Array of texts to embed
 * @param apiKey - Optional API key (defaults to OPENROUTER_API_KEY env var)
 * @returns Array of embedding vectors in the same order as input
 * @throws Error if the API call fails or no API key is available
 */
export async function embedBatch(
  texts: string[],
  apiKey?: string
): Promise<number[][]> {
  const key = apiKey ?? process.env.OPENROUTER_API_KEY;

  if (!key) {
    throw new Error('No API key provided for embeddings');
  }

  const response = await fetch(OPENROUTER_EMBEDDINGS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: DEFAULT_MODEL,
      input: texts,
    }),
  });

  if (!response.ok) {
    throw new Error(`Embedding failed: ${response.statusText}`);
  }

  const data: EmbeddingResponse = await response.json();

  // Sort by index to ensure order matches input
  return data.data
    .sort((a, b) => a.index - b.index)
    .map((item) => item.embedding);
}
