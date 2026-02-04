import { promises as fs } from 'fs';
import path from 'path';

/**
 * Get the storage path for document files.
 * Reads from environment at runtime for testability.
 * Defaults to ./uploads/documents if not specified.
 */
function getStorageBasePath(): string {
  return process.env.DOCUMENT_STORAGE_PATH || './uploads/documents';
}

/**
 * Get the storage directory path for a user's document.
 */
function getDocumentDir(userId: string, documentId: string): string {
  return path.join(getStorageBasePath(), userId, documentId);
}

/**
 * Store a PDF document to disk.
 * Creates the directory structure if it doesn't exist.
 *
 * @param pdfBytes - The PDF content as Uint8Array
 * @param userId - The user who owns this document
 * @param documentId - The document ID
 * @param type - Whether this is the original or processed PDF
 * @returns The file path where the document was stored
 */
export async function storeDocument(
  pdfBytes: Uint8Array,
  userId: string,
  documentId: string,
  type: 'original' | 'processed'
): Promise<string> {
  const dir = getDocumentDir(userId, documentId);
  await fs.mkdir(dir, { recursive: true });

  const filename = type === 'original' ? 'original.pdf' : 'processed.pdf';
  const filePath = path.join(dir, filename);

  await fs.writeFile(filePath, pdfBytes);
  return filePath;
}

/**
 * Get the file path for a stored document.
 *
 * @param userId - The user who owns this document
 * @param documentId - The document ID
 * @param type - Whether to get the original or processed PDF
 * @returns The file path
 */
export function getDocumentPath(
  userId: string,
  documentId: string,
  type: 'original' | 'processed'
): string {
  const dir = getDocumentDir(userId, documentId);
  const filename = type === 'original' ? 'original.pdf' : 'processed.pdf';
  return path.join(dir, filename);
}

/**
 * Read a stored document from disk.
 *
 * @param userId - The user who owns this document
 * @param documentId - The document ID
 * @param type - Whether to read the original or processed PDF
 * @returns The PDF content as Uint8Array
 * @throws Error if the file doesn't exist
 */
export async function readDocument(
  userId: string,
  documentId: string,
  type: 'original' | 'processed'
): Promise<Uint8Array> {
  const filePath = getDocumentPath(userId, documentId, type);
  const buffer = await fs.readFile(filePath);
  return new Uint8Array(buffer);
}

/**
 * Check if a document file exists on disk.
 *
 * @param userId - The user who owns this document
 * @param documentId - The document ID
 * @param type - Whether to check for original or processed PDF
 * @returns True if the file exists
 */
export async function documentExists(
  userId: string,
  documentId: string,
  type: 'original' | 'processed'
): Promise<boolean> {
  const filePath = getDocumentPath(userId, documentId, type);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a document and its directory.
 * Removes both original and processed PDFs if they exist.
 *
 * @param userId - The user who owns this document
 * @param documentId - The document ID
 */
export async function deleteDocument(
  userId: string,
  documentId: string
): Promise<void> {
  const dir = getDocumentDir(userId, documentId);
  try {
    await fs.rm(dir, { recursive: true, force: true });
  } catch (error) {
    // Ignore errors if directory doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}

/**
 * Get the storage base path (for testing purposes).
 */
export function getStoragePath(): string {
  return getStorageBasePath();
}
