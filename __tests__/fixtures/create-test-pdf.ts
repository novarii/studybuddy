/**
 * Script to generate test PDF fixtures for unit tests.
 * Run with: npx tsx __tests__/fixtures/create-test-pdf.ts
 */
import { PDFDocument, rgb } from 'pdf-lib';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function createTestPdf(pageCount: number, filename: string): Promise<void> {
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([612, 792]); // US Letter size
    const { height } = page.getSize();

    // Add page number text
    page.drawText(`Page ${i + 1} of ${pageCount}`, {
      x: 50,
      y: height - 50,
      size: 24,
      color: rgb(0, 0, 0),
    });

    // Add some unique content to each page
    page.drawText(`This is test content for page ${i + 1}.`, {
      x: 50,
      y: height - 100,
      size: 14,
      color: rgb(0.3, 0.3, 0.3),
    });

    // Add a unique identifier
    page.drawText(`UUID: test-page-${i + 1}-${Date.now()}`, {
      x: 50,
      y: height - 130,
      size: 10,
      color: rgb(0.5, 0.5, 0.5),
    });
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = join(__dirname, filename);
  writeFileSync(outputPath, pdfBytes);
  console.log(`Created ${outputPath} with ${pageCount} pages`);
}

async function main(): Promise<void> {
  // Create various test PDFs
  await createTestPdf(3, 'test-3-pages.pdf');
  await createTestPdf(1, 'test-1-page.pdf');
  await createTestPdf(5, 'test-5-pages.pdf');
  console.log('All test PDFs created successfully!');
}

main().catch(console.error);
