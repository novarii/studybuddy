import { eq } from 'drizzle-orm';
import { db, documents } from '@/lib/db';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';
import { storeDocument } from '@/lib/storage/documents';
import { splitPdfIntoPages } from './pdf-splitter';
import { rebuildPdfWithoutPages } from './pdf-rebuilder';
import { processPages } from './page-processor';
import { deduplicateByEmbeddings } from './deduplication';
import {
  generateChunkEmbeddings,
  insertChunks,
  prepareChunks,
} from './chunk-ingestion';

/**
 * Options for processing a document through the pipeline.
 */
export interface ProcessDocumentOptions {
  /** Document ID for status updates */
  documentId: string;
  /** PDF file bytes */
  pdfBytes: Uint8Array;
  /** Owner user ID */
  userId: string;
  /** Associated course ID */
  courseId: string;
  /** Original filename */
  filename: string;
}

/**
 * Fields that can be updated on a document.
 */
export interface DocumentStatusUpdate {
  status?: 'processing' | 'completed' | 'failed';
  pageCount?: number;
  uniquePageCount?: number;
  failedPages?: number[] | null;
  errorMessage?: string | null;
  processedFilePath?: string;
  processedAt?: Date;
}

/**
 * Update the status and metadata of a document in the database.
 *
 * @param documentId - The document ID to update
 * @param update - Fields to update
 */
export async function updateDocumentStatus(
  documentId: string,
  update: DocumentStatusUpdate
): Promise<void> {
  await db
    .update(documents)
    .set(update)
    .where(eq(documents.id, documentId));
}

/**
 * Process a PDF document through the full pipeline.
 *
 * Pipeline steps:
 * 1. Get user's API key (BYOK or fallback)
 * 2. Split PDF into single-page PDFs
 * 3. Process pages in parallel with Gemini extraction
 * 4. Generate embeddings for all successful pages
 * 5. Deduplicate using cosine similarity on embeddings
 * 6. Insert only unique chunks into vector database
 * 7. Rebuild lean PDF without duplicates
 * 8. Update document status to completed
 *
 * On failure, updates document status to 'failed' with error message.
 *
 * @param options - Processing options including document ID, PDF bytes, and metadata
 */
export async function processDocument(
  options: ProcessDocumentOptions
): Promise<void> {
  const { documentId, pdfBytes, userId, courseId, filename } = options;

  try {
    // 1. Get user's API key (BYOK or fallback)
    const apiKey = await getUserApiKey(userId);

    // 2. Split PDF into single-page PDFs
    const pages = await splitPdfIntoPages(pdfBytes);

    // Update page count
    await updateDocumentStatus(documentId, { pageCount: pages.length });

    // 3. Process pages in parallel with Gemini extraction
    const pageResults = await processPages(pages, apiKey);

    // Track failed pages
    const failedPages = pageResults
      .filter((r) => !r.success)
      .map((r) => r.pageNumber);

    // Filter to only successful pages for embedding
    const successfulPages = pageResults.filter((r) => r.success && r.content);

    // 4. Generate embeddings for ALL successful pages
    const allEmbeddings = await generateChunkEmbeddings(successfulPages, apiKey);

    // 5. Deduplicate using cosine similarity on embeddings
    const { uniqueIndices, duplicateIndices: dedupedIndices } =
      deduplicateByEmbeddings(allEmbeddings);

    // Map back to original page numbers for PDF rebuilding
    const duplicatePageNumbers = dedupedIndices.map(
      (i) => successfulPages[i].pageNumber
    );

    // Filter to only unique pages and embeddings
    const uniquePages = uniqueIndices.map((i) => successfulPages[i]);
    const uniqueEmbeddings = uniqueIndices.map((i) => allEmbeddings[i]);

    // 6. Prepare and insert only unique chunks into vector database
    const chunks = prepareChunks(uniquePages, uniqueEmbeddings);
    await insertChunks(chunks, {
      documentId,
      courseId,
      userId,
      filename,
    });

    // 7. Rebuild lean PDF without duplicate pages
    const leanPdfBytes = await rebuildPdfWithoutPages(
      pdfBytes,
      duplicatePageNumbers
    );

    // Store processed PDF
    const processedFilePath = await storeDocument(
      leanPdfBytes,
      userId,
      documentId,
      'processed'
    );

    // 8. Update document status to completed
    await updateDocumentStatus(documentId, {
      status: 'completed',
      uniquePageCount: uniquePages.length,
      failedPages: failedPages.length > 0 ? failedPages : null,
      processedFilePath,
      processedAt: new Date(),
    });

    console.log(
      `[DocumentPipeline] Document ${documentId} processed successfully. ` +
        `Pages: ${pages.length}, Unique: ${uniquePages.length}, ` +
        `Duplicates removed: ${duplicatePageNumbers.length}, Failed: ${failedPages.length}`
    );
  } catch (error) {
    console.error(`[DocumentPipeline] Document ${documentId} processing failed:`, error);

    // Update status to failed
    await updateDocumentStatus(documentId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
