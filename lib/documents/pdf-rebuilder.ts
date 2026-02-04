import { PDFDocument } from 'pdf-lib';

/**
 * Rebuild a PDF document excluding specified pages.
 *
 * Creates a new "lean" PDF by copying only the pages that are NOT
 * in the exclusion list. This is used after deduplication to create
 * a smaller PDF without duplicate/similar pages.
 *
 * All operations are performed in-memory (no temp files).
 *
 * @param pdfBytes - The original PDF as Uint8Array
 * @param pageIndicesToRemove - Array of 0-indexed page numbers to exclude
 * @returns New PDF as Uint8Array with the specified pages removed
 * @throws Error if the PDF bytes are invalid
 */
export async function rebuildPdfWithoutPages(
  pdfBytes: Uint8Array,
  pageIndicesToRemove: number[]
): Promise<Uint8Array> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();

  // Create a Set for O(1) lookup and handle duplicates
  const removeSet = new Set(
    pageIndicesToRemove.filter((i) => i >= 0 && i < pageCount)
  );

  // If nothing to remove, return original PDF bytes
  if (removeSet.size === 0) {
    return pdfBytes;
  }

  // Get indices to keep
  const pagesToKeep: number[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (!removeSet.has(i)) {
      pagesToKeep.push(i);
    }
  }

  // If all pages would be removed, return original (edge case)
  if (pagesToKeep.length === 0) {
    return pdfBytes;
  }

  // Create new PDF with only the pages to keep
  const newDoc = await PDFDocument.create();
  const copiedPages = await newDoc.copyPages(pdfDoc, pagesToKeep);
  copiedPages.forEach((page) => newDoc.addPage(page));

  return await newDoc.save();
}
