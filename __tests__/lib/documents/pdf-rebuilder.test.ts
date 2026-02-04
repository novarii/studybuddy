import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { rebuildPdfWithoutPages } from '@/lib/documents/pdf-rebuilder';

describe('rebuildPdfWithoutPages', () => {
  const fixturesDir = join(__dirname, '../../fixtures');

  it('should remove specified pages from a PDF', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-5-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    // Remove pages 1 and 3 (0-indexed)
    const result = await rebuildPdfWithoutPages(originalBytes, [1, 3]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(3); // 5 - 2 = 3
  });

  it('should return original when no pages to remove', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    const result = await rebuildPdfWithoutPages(originalBytes, []);

    // Should have same page count
    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(3);
  });

  it('should handle removing the first page', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    const result = await rebuildPdfWithoutPages(originalBytes, [0]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(2);
  });

  it('should handle removing the last page', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    const result = await rebuildPdfWithoutPages(originalBytes, [2]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(2);
  });

  it('should handle removing all but one page', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    // Remove pages 0 and 1, keeping only page 2
    const result = await rebuildPdfWithoutPages(originalBytes, [0, 1]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(1);
  });

  it('should handle single-page PDF with no removals', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-1-page.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    const result = await rebuildPdfWithoutPages(originalBytes, []);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(1);
  });

  it('should return Uint8Array', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    const result = await rebuildPdfWithoutPages(originalBytes, [0]);

    expect(result).toBeInstanceOf(Uint8Array);
  });

  it('should ignore out-of-bounds page indices', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    // Try to remove page index 10 which doesn't exist
    const result = await rebuildPdfWithoutPages(originalBytes, [10, 100]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(3); // No pages removed
  });

  it('should handle duplicate indices in removal list', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);

    // Remove page 1 twice (should only remove once)
    const result = await rebuildPdfWithoutPages(originalBytes, [1, 1, 1]);

    const resultDoc = await PDFDocument.load(result);
    expect(resultDoc.getPageCount()).toBe(2);
  });

  it('should preserve page dimensions', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const originalBytes = new Uint8Array(pdfBytes);
    const originalDoc = await PDFDocument.load(originalBytes);

    // Remove middle page
    const result = await rebuildPdfWithoutPages(originalBytes, [1]);
    const resultDoc = await PDFDocument.load(result);

    // First page should match original first page dimensions
    const originalFirstPage = originalDoc.getPage(0);
    const resultFirstPage = resultDoc.getPage(0);
    expect(resultFirstPage.getWidth()).toBeCloseTo(originalFirstPage.getWidth(), 0);
    expect(resultFirstPage.getHeight()).toBeCloseTo(originalFirstPage.getHeight(), 0);
  });

  it('should throw on invalid PDF bytes', async () => {
    const invalidBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    await expect(rebuildPdfWithoutPages(invalidBytes, [0])).rejects.toThrow();
  });
});
