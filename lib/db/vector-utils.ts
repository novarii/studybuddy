/**
 * Utility functions for safe PostgreSQL vector operations.
 *
 * These functions prevent SQL injection when working with pgvector
 * by validating embedding arrays before constructing SQL literals.
 */

/**
 * Validate and format an embedding array as a PostgreSQL vector literal.
 *
 * This function prevents SQL injection by ensuring all embedding values
 * are valid finite numbers before constructing the vector string.
 *
 * @param embedding - Array of embedding values
 * @returns PostgreSQL vector literal string (e.g., "[0.1,0.2,0.3]")
 * @throws Error if embedding is not a valid numeric array
 */
export function formatVectorLiteral(embedding: number[]): string {
  if (!Array.isArray(embedding)) {
    throw new Error('Embedding must be an array');
  }
  if (embedding.length === 0) {
    throw new Error('Embedding array cannot be empty');
  }
  for (let i = 0; i < embedding.length; i++) {
    const value = embedding[i];
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Invalid embedding value at index ${i}: must be a finite number`);
    }
  }
  return `[${embedding.join(',')}]`;
}
