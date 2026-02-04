import { describe, it, expect, beforeEach } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { splitPdfIntoPages } from '@/lib/documents/pdf-splitter';
import { rebuildPdfWithoutPages } from '@/lib/documents/pdf-rebuilder';
import { computeChecksum } from '@/lib/documents/checksum';

/**
 * Edge case tests for document pipeline (Task 6.2)
 *
 * These tests cover scenarios NOT covered by existing tests:
 * - Large PDFs (50+ pages) - existing tests only go up to 5 pages
 * - Different page sizes affecting checksum
 * - Corrupted PDF with valid header
 */

describe('PDF Edge Cases', () => {
  describe('Large PDF (50+ pages)', () => {
    let largePdfBytes: Uint8Array;
    const PAGE_COUNT = 50;

    beforeEach(async () => {
      const doc = await PDFDocument.create();
      for (let i = 0; i < PAGE_COUNT; i++) {
        doc.addPage([612, 792]);
      }
      largePdfBytes = await doc.save();
    }, 15000);

    it('splitPdfIntoPages should handle 50-page PDF', async () => {
      const pages = await splitPdfIntoPages(largePdfBytes);

      expect(pages).toHaveLength(PAGE_COUNT);

      // Spot check a few pages
      for (const idx of [0, 24, 49]) {
        const pageDoc = await PDFDocument.load(pages[idx]);
        expect(pageDoc.getPageCount()).toBe(1);
      }
    }, 30000);

    it('rebuildPdfWithoutPages should remove pages from large PDF', async () => {
      // Remove every other page (25 pages total)
      const pagesToRemove = Array.from({ length: 25 }, (_, i) => i * 2);

      const result = await rebuildPdfWithoutPages(largePdfBytes, pagesToRemove);

      const resultDoc = await PDFDocument.load(result);
      expect(resultDoc.getPageCount()).toBe(25);
    }, 30000);

    it('rebuildPdfWithoutPages should handle removing all but one page', async () => {
      const pagesToRemove = Array.from({ length: PAGE_COUNT - 1 }, (_, i) => i);

      const result = await rebuildPdfWithoutPages(largePdfBytes, pagesToRemove);

      const resultDoc = await PDFDocument.load(result);
      expect(resultDoc.getPageCount()).toBe(1);
    }, 30000);

    it('computeChecksum should work with large PDF', async () => {
      const checksum = computeChecksum(largePdfBytes);

      expect(checksum).toHaveLength(64);
      expect(checksum).toMatch(/^[a-f0-9]{64}$/);
    });
  });

  describe('Checksum Edge Cases', () => {
    it('should produce different checksums for different page sizes', async () => {
      const doc1 = await PDFDocument.create();
      doc1.addPage([612, 792]); // Letter
      const pdfBytes1 = await doc1.save();

      const doc2 = await PDFDocument.create();
      doc2.addPage([595, 842]); // A4
      const pdfBytes2 = await doc2.save();

      const checksum1 = computeChecksum(pdfBytes1);
      const checksum2 = computeChecksum(pdfBytes2);

      expect(checksum1).not.toBe(checksum2);
    });
  });

  describe('Corrupted PDF Edge Cases', () => {
    it('should handle corrupted PDF with valid header', async () => {
      // Create bytes that start with valid PDF header but are corrupted
      const corruptedBytes = new Uint8Array([
        0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, // %PDF-1.4
        0x00, 0x00, 0x00, 0x00, // Corrupted data where structure should be
      ]);

      await expect(splitPdfIntoPages(corruptedBytes)).rejects.toThrow();
    });
  });
});
