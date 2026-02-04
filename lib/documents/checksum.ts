import { createHash } from 'crypto';

/**
 * Compute a SHA-256 checksum of PDF bytes.
 *
 * Used for duplicate detection - if two PDFs have the same checksum,
 * they are identical and the second upload should be rejected.
 *
 * @param pdfBytes - The PDF content as Uint8Array
 * @returns Lowercase hexadecimal SHA-256 hash string (64 characters)
 */
export function computeChecksum(pdfBytes: Uint8Array): string {
  const hash = createHash('sha256');
  hash.update(pdfBytes);
  return hash.digest('hex');
}
