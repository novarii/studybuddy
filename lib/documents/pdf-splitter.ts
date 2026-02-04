import { PDFDocument } from 'pdf-lib';

/**
 * Split a PDF document into individual single-page PDFs.
 *
 * Each page is extracted as a standalone PDF document, returned as
 * Uint8Array bytes. This is used for parallel processing of pages
 * through the extraction pipeline.
 *
 * All operations are performed in-memory (no temp files).
 *
 * @param pdfBytes - The original PDF as Uint8Array
 * @returns Array of Uint8Array, each containing a single-page PDF
 * @throws Error if the PDF bytes are invalid
 */
export async function splitPdfIntoPages(
  pdfBytes: Uint8Array
): Promise<Uint8Array[]> {
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const pageCount = pdfDoc.getPageCount();
  const pages: Uint8Array[] = [];

  for (let i = 0; i < pageCount; i++) {
    const newDoc = await PDFDocument.create();
    const [copiedPage] = await newDoc.copyPages(pdfDoc, [i]);
    newDoc.addPage(copiedPage);
    pages.push(await newDoc.save());
  }

  return pages;
}
