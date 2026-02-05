import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';
import path from 'path';

// Use a temp directory for testing
const TEST_TEMP_PATH = '/tmp/test-lecture-temp';

// Set the env before the module is imported
process.env.LECTURE_TEMP_PATH = TEST_TEMP_PATH;

// Import after setting env
import {
  saveTempAudio,
  getTempAudioPath,
  cleanupTempAudio,
  tempAudioExists,
  ensureTempDir,
  getTempBasePath,
} from '@/lib/lectures/temp-files';

describe('Lecture Temp Files', () => {
  const testLectureId = 'lecture_123';
  const testAudioContent = new Uint8Array([0xff, 0xfb, 0x90, 0x00]); // MP3 header

  beforeEach(async () => {
    // Clean up test directory before each test
    try {
      await fs.rm(TEST_TEMP_PATH, { recursive: true, force: true });
    } catch {
      // Ignore if doesn't exist
    }
    await fs.mkdir(TEST_TEMP_PATH, { recursive: true });
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await fs.rm(TEST_TEMP_PATH, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('getTempBasePath', () => {
    it('should return the configured temp path', () => {
      expect(getTempBasePath()).toBe(TEST_TEMP_PATH);
    });
  });

  describe('ensureTempDir', () => {
    it('should create the temp directory if it does not exist', async () => {
      // Delete the directory first
      await fs.rm(TEST_TEMP_PATH, { recursive: true, force: true });

      await ensureTempDir();

      const stats = await fs.stat(TEST_TEMP_PATH);
      expect(stats.isDirectory()).toBe(true);
    });

    it('should not throw if directory already exists', async () => {
      await expect(ensureTempDir()).resolves.not.toThrow();
    });
  });

  describe('getTempAudioPath', () => {
    it('should return correct path for audio file', () => {
      const filePath = getTempAudioPath(testLectureId);
      expect(filePath).toBe(path.join(TEST_TEMP_PATH, `${testLectureId}.mp3`));
    });

    it('should handle different lecture IDs', () => {
      const filePath = getTempAudioPath('another-lecture-id');
      expect(filePath).toBe(path.join(TEST_TEMP_PATH, 'another-lecture-id.mp3'));
    });
  });

  describe('saveTempAudio', () => {
    it('should save audio content and return file path', async () => {
      const filePath = await saveTempAudio(testLectureId, testAudioContent);

      expect(filePath).toContain(testLectureId);
      expect(filePath).toContain('.mp3');

      // Verify file was written
      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(testAudioContent);
    });

    it('should create directory if it does not exist', async () => {
      // Delete the directory first
      await fs.rm(TEST_TEMP_PATH, { recursive: true, force: true });

      const filePath = await saveTempAudio(testLectureId, testAudioContent);

      // Verify file exists (implies directory was created)
      const stats = await fs.stat(filePath);
      expect(stats.isFile()).toBe(true);
    });

    it('should overwrite existing file', async () => {
      // Save initial content
      await saveTempAudio(testLectureId, testAudioContent);

      // Save new content
      const newContent = new Uint8Array([0xff, 0xfb, 0x90, 0x01, 0x02, 0x03]);
      const filePath = await saveTempAudio(testLectureId, newContent);

      // Verify new content
      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(newContent);
    });

    it('should handle Buffer input', async () => {
      const bufferContent = Buffer.from([0xff, 0xfb, 0x90, 0x00]);
      const filePath = await saveTempAudio(testLectureId, bufferContent);

      const storedContent = await fs.readFile(filePath);
      expect(new Uint8Array(storedContent)).toEqual(new Uint8Array(bufferContent));
    });
  });

  describe('tempAudioExists', () => {
    it('should return true if audio file exists', async () => {
      await saveTempAudio(testLectureId, testAudioContent);

      const exists = await tempAudioExists(testLectureId);
      expect(exists).toBe(true);
    });

    it('should return false if audio file does not exist', async () => {
      const exists = await tempAudioExists('nonexistent-lecture');
      expect(exists).toBe(false);
    });
  });

  describe('cleanupTempAudio', () => {
    it('should delete the temp audio file', async () => {
      await saveTempAudio(testLectureId, testAudioContent);

      // Verify file exists before cleanup
      let exists = await tempAudioExists(testLectureId);
      expect(exists).toBe(true);

      await cleanupTempAudio(testLectureId);

      // Verify file is deleted
      exists = await tempAudioExists(testLectureId);
      expect(exists).toBe(false);
    });

    it('should not throw error if file does not exist', async () => {
      await expect(
        cleanupTempAudio('nonexistent-lecture')
      ).resolves.not.toThrow();
    });

    it('should only delete the specified lecture file', async () => {
      const otherLectureId = 'other_lecture_456';
      await saveTempAudio(testLectureId, testAudioContent);
      await saveTempAudio(otherLectureId, testAudioContent);

      await cleanupTempAudio(testLectureId);

      // Verify only the target file is deleted
      const targetExists = await tempAudioExists(testLectureId);
      const otherExists = await tempAudioExists(otherLectureId);

      expect(targetExists).toBe(false);
      expect(otherExists).toBe(true);
    });
  });
});
