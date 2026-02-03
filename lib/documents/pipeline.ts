import { eq } from 'drizzle-orm';
import { db, documents } from '@/lib/db';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';
import { storeDocument } from '@/lib/storage/documents';
import { splitPdfIntoPages } from './pdf-splitter';
import { rebuildPdfWithoutPages } from './pdf-rebuilder';
import { processPages } from './page-processor';
import { deduplicatePages, deduplicateByEmbeddings } from './deduplication';
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
 * 4. Phase 1 deduplication: Jaccard on text (saves embedding cost)
 * 5. Generate embeddings for Jaccard-unique pages only
 * 6. Phase 2 deduplication: Cosine similarity on embeddings
 * 7. Insert only unique chunks into vector database
 * 8. Rebuild lean PDF without duplicates
 * 9. Update document status to completed
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

    // 4. Phase 1: Jaccard deduplication on extracted text
    // This catches obvious text duplicates BEFORE embedding (saves API cost)
    const { unique: jaccardUnique, duplicateIndices: jaccardDuplicates } =
      deduplicatePages(pageResults);

    console.log(
      `[DocumentPipeline] Phase 1 (Jaccard): ${jaccardDuplicates.length} text duplicates removed`
    );

    // 5. Generate embeddings only for Jaccard-unique pages
    const embeddings = await generateChunkEmbeddings(jaccardUnique, apiKey);

    // 6. Phase 2: Cosine similarity deduplication on embeddings
    // This catches semantic duplicates that Jaccard missed
    const { uniqueIndices, duplicateIndices: cosineDuplicates } =
      deduplicateByEmbeddings(embeddings);

    console.log(
      `[DocumentPipeline] Phase 2 (Cosine): ${cosineDuplicates.length} semantic duplicates removed`
    );

    // Map cosine duplicates back to original page numbers
    const cosineDuplicatePageNumbers = cosineDuplicates.map(
      (i) => jaccardUnique[i].pageNumber
    );

    // Combine all duplicate page numbers for PDF rebuilding
    const allDuplicatePageNumbers = [
      ...jaccardDuplicates,
      ...cosineDuplicatePageNumbers,
    ];

    // Filter to only final unique pages and embeddings
    const uniquePages = uniqueIndices.map((i) => jaccardUnique[i]);
    const uniqueEmbeddings = uniqueIndices.map((i) => embeddings[i]);

    // 7. Prepare and insert only unique chunks into vector database
    const chunks = prepareChunks(uniquePages, uniqueEmbeddings);
    await insertChunks(chunks, {
      documentId,
      courseId,
      userId,
      filename,
    });

    // 8. Rebuild lean PDF without duplicate pages
    const leanPdfBytes = await rebuildPdfWithoutPages(
      pdfBytes,
      allDuplicatePageNumbers
    );

    // Store processed PDF
    const processedFilePath = await storeDocument(
      leanPdfBytes,
      userId,
      documentId,
      'processed'
    );

    // 9. Update document status to completed
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
        `Duplicates: ${allDuplicatePageNumbers.length} (Jaccard: ${jaccardDuplicates.length}, Cosine: ${cosineDuplicates.length}), ` +
        `Failed: ${failedPages.length}`
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
