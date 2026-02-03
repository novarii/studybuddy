import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { computeChecksum } from '@/lib/documents/checksum';

describe('computeChecksum', () => {
  const fixturesDir = join(__dirname, '../../fixtures');

  it('should compute SHA-256 checksum for a PDF', () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const checksum = computeChecksum(new Uint8Array(pdfBytes));

    // SHA-256 produces 64 character hex string
    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should produce consistent checksums for same content', () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));
    const bytes = new Uint8Array(pdfBytes);

    const checksum1 = computeChecksum(bytes);
    const checksum2 = computeChecksum(bytes);

    expect(checksum1).toBe(checksum2);
  });

  it('should produce different checksums for different content', () => {
    const pdf1 = readFileSync(join(fixturesDir, 'test-1-page.pdf'));
    const pdf3 = readFileSync(join(fixturesDir, 'test-3-pages.pdf'));

    const checksum1 = computeChecksum(new Uint8Array(pdf1));
    const checksum3 = computeChecksum(new Uint8Array(pdf3));

    expect(checksum1).not.toBe(checksum3);
  });

  it('should handle empty input', () => {
    const emptyBytes = new Uint8Array(0);
    const checksum = computeChecksum(emptyBytes);

    // SHA-256 of empty string
    expect(checksum).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('should work with small byte arrays', () => {
    const smallBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header
    const checksum = computeChecksum(smallBytes);

    expect(checksum).toHaveLength(64);
    expect(checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('should return lowercase hex string', () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-1-page.pdf'));
    const checksum = computeChecksum(new Uint8Array(pdfBytes));

    // Should be lowercase
    expect(checksum).toBe(checksum.toLowerCase());
  });

  it('should handle large files', () => {
    const pdfBytes = readFileSync(join(fixturesDir, 'test-5-pages.pdf'));
    const checksum = computeChecksum(new Uint8Array(pdfBytes));

    expect(checksum).toHaveLength(64);
  });

  it('should work with Buffer input converted to Uint8Array', () => {
    const pdfBuffer = readFileSync(join(fixturesDir, 'test-1-page.pdf'));
    const pdfBytes = new Uint8Array(pdfBuffer);

    const checksumFromBuffer = computeChecksum(pdfBytes);
    const checksumDirect = computeChecksum(new Uint8Array(pdfBuffer));

    expect(checksumFromBuffer).toBe(checksumDirect);
  });
});
