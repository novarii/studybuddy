import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// Use a temp directory for testing
const TEST_STORAGE_PATH = '/tmp/test-document-storage';

// We need to set the env before the module is imported
process.env.DOCUMENT_STORAGE_PATH = TEST_STORAGE_PATH;

// Import after setting env
import {
  storeDocument,
  getDocumentPath,
  readDocument,
  documentExists,
  deleteDocument,
  getStoragePath,
} from '@/lib/storage/documents';

describe('Document Storage', () => {
  const testUserId = 'user_123';
  const testDocumentId = 'doc_456';
  const testPdfContent = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF header

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await fs.mkdir(TEST_STORAGE_PATH, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(TEST_STORAGE_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getStoragePath', () => {
    it('should return the configured storage path', () => {
      expect(getStoragePath()).toBe(TEST_STORAGE_PATH);
    });
  });

  describe('getDocumentPath', () => {
    it('should return correct path for original PDF', () => {
      const filePath = getDocumentPath(testUserId, testDocumentId, 'original');
      expect(filePath).toBe(
        path.join(TEST_STORAGE_PATH, testUserId, testDocumentId, 'original.pdf')
      );
    });

    it('should return correct path for processed PDF', () => {
      const filePath = getDocumentPath(testUserId, testDocumentId, 'processed');
      expect(filePath).toBe(
        path.join(
          TEST_STORAGE_PATH,
          testUserId,
          testDocumentId,
          'processed.pdf'
        )
      );
    });
  });

  describe('storeDocument', () => {
    it('should store original PDF and return file path', async () => {
      const filePath = await storeDocument(
        testPdfContent,
        testUserId,
        testDocumentId,
        'original'
      );

      expect(filePath).toContain('original.pdf');

      // Verify file was written
      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(testPdfContent);
    });

    it('should store processed PDF and return file path', async () => {
      const filePath = await storeDocument(
        testPdfContent,
        testUserId,
        testDocumentId,
        'processed'
      );

      expect(filePath).toContain('processed.pdf');

      // Verify file was written
      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(testPdfContent);
    });

    it('should create directory structure if it does not exist', async () => {
      const newUserId = 'new_user';
      const newDocId = 'new_doc';

      await storeDocument(testPdfContent, newUserId, newDocId, 'original');

      const dirPath = path.join(TEST_STORAGE_PATH, newUserId, newDocId);
      const stats = await fs.stat(dirPath);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should overwrite existing file', async () => {
      // Store initial content
      await storeDocument(testPdfContent, testUserId, testDocumentId, 'original');

      // Store new content
      const newContent = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
      const filePath = await storeDocument(
        newContent,
        testUserId,
        testDocumentId,
        'original'
      );

      // Verify new content
      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(newContent);
    });
  });

  describe('readDocument', () => {
    it('should read stored original PDF', async () => {
      await storeDocument(testPdfContent, testUserId, testDocumentId, 'original');

      const content = await readDocument(
        testUserId,
        testDocumentId,
        'original'
      );
      expect(content).toEqual(testPdfContent);
    });

    it('should read stored processed PDF', async () => {
      await storeDocument(
        testPdfContent,
        testUserId,
        testDocumentId,
        'processed'
      );

      const content = await readDocument(
        testUserId,
        testDocumentId,
        'processed'
      );
      expect(content).toEqual(testPdfContent);
    });

    it('should throw error if file does not exist', async () => {
      await expect(
        readDocument('nonexistent', 'nonexistent', 'original')
      ).rejects.toThrow();
    });
  });

  describe('documentExists', () => {
    it('should return true if document exists', async () => {
      await storeDocument(testPdfContent, testUserId, testDocumentId, 'original');

      const exists = await documentExists(
        testUserId,
        testDocumentId,
        'original'
      );
      expect(exists).toBe(true);
    });

    it('should return false if document does not exist', async () => {
      const exists = await documentExists('nonexistent', 'nonexistent', 'original');
      expect(exists).toBe(false);
    });

    it('should differentiate between original and processed', async () => {
      await storeDocument(testPdfContent, testUserId, testDocumentId, 'original');

      const originalExists = await documentExists(
        testUserId,
        testDocumentId,
        'original'
      );
      const processedExists = await documentExists(
        testUserId,
        testDocumentId,
        'processed'
      );

      expect(originalExists).toBe(true);
      expect(processedExists).toBe(false);
    });
  });

  describe('deleteDocument', () => {
    it('should delete document and directory', async () => {
      await storeDocument(testPdfContent, testUserId, testDocumentId, 'original');
      await storeDocument(
        testPdfContent,
        testUserId,
        testDocumentId,
        'processed'
      );

      await deleteDocument(testUserId, testDocumentId);

      // Verify both files are gone
      const originalExists = await documentExists(
        testUserId,
        testDocumentId,
        'original'
      );
      const processedExists = await documentExists(
        testUserId,
        testDocumentId,
        'processed'
      );

      expect(originalExists).toBe(false);
      expect(processedExists).toBe(false);
    });

    it('should not throw error if document does not exist', async () => {
      await expect(
        deleteDocument('nonexistent', 'nonexistent')
      ).resolves.not.toThrow();
    });
  });
});
