import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { PDFDocument } from 'pdf-lib';
import { splitPdfIntoPages } from '@/lib/documents/pdf-splitter';

describe('splitPdfIntoPages', () => {
  const fixturesDir = join(__dirname, '../../fixtures');

  it('should split a 3-page PDF into 3 single-page PDFs', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const pages = await splitPdfIntoPages(new Uint8Array(pdfBytes));

    expect(pages).toHaveLength(3);

    // Each page should be a valid single-page PDF
    for (let i = 0; i < pages.length; i++) {
      const pageDoc = await PDFDocument.load(pages[i]);
      expect(pageDoc.getPageCount()).toBe(1);
    }
  });

  it('should split a 1-page PDF into a single-page array', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-1-page.pdf'));
    const pages = await splitPdfIntoPages(new Uint8Array(pdfBytes));

    expect(pages).toHaveLength(1);

    const pageDoc = await PDFDocument.load(pages[0]);
    expect(pageDoc.getPageCount()).toBe(1);
  });

  it('should handle a 5-page PDF correctly', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-5-pages.pdf'));
    const pages = await splitPdfIntoPages(new Uint8Array(pdfBytes));

    expect(pages).toHaveLength(5);

    // Verify each is a valid PDF
    for (const page of pages) {
      const pageDoc = await PDFDocument.load(page);
      expect(pageDoc.getPageCount()).toBe(1);
    }
  });

  it('should return Uint8Array instances', async () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const pages = await splitPdfIntoPages(new Uint8Array(pdfBytes));

    for (const page of pages) {
      expect(page).toBeInstanceOf(Uint8Array);
    }
  });

  it('should preserve page content in split pages', async () => {
    const pdfBuffer = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const pdfBytes = new Uint8Array(pdfBuffer);
    const pages = await splitPdfIntoPages(pdfBytes);

    // Load original and split pages, verify dimensions match
    const originalDoc = await PDFDocument.load(pdfBytes);

    for (let i = 0; i < pages.length; i++) {
      const pageDoc = await PDFDocument.load(pages[i]);
      const originalPage = originalDoc.getPage(i);
      const splitPage = pageDoc.getPage(0);

      // Check page dimensions match
      expect(splitPage.getWidth()).toBeCloseTo(originalPage.getWidth(), 0);
      expect(splitPage.getHeight()).toBeCloseTo(originalPage.getHeight(), 0);
    }
  });

  it('should throw on invalid PDF bytes', async () => {
    const invalidBytes = new Uint8Array([0x00, 0x01, 0x02, 0x03]);

    await expect(splitPdfIntoPages(invalidBytes)).rejects.toThrow();
  });

  it('should work with a programmatically created PDF', async () => {
    // Create a fresh PDF with one page
    const newDoc = await PDFDocument.create();
    newDoc.addPage([612, 792]);
    const pdfBytes = await newDoc.save();

    const pages = await splitPdfIntoPages(pdfBytes);
    expect(pages).toHaveLength(1);

    // Verify the split page is valid
    const pageDoc = await PDFDocument.load(pages[0]);
    expect(pageDoc.getPageCount()).toBe(1);
  });
});
