import { promises as fs } from 'fs';
import path from 'path';

/**
 * Get the temp storage path for lecture audio files.
 * Reads from environment at runtime for testability.
 * Defaults to ./tmp/lectures if not specified.
 */
function getTempPath(): string {
  return process.env.LECTURE_TEMP_PATH || './tmp/lectures';
}

/**
 * Get the temp storage base path (for testing purposes).
 */
export function getTempBasePath(): string {
  return getTempPath();
}

/**
 * Ensure the temp directory exists.
 * Creates it if it doesn't exist.
 */
export async function ensureTempDir(): Promise<void> {
  await fs.mkdir(getTempPath(), { recursive: true });
}

/**
 * Get the temp file path for a lecture's audio file.
 *
 * @param lectureId - The lecture ID
 * @returns The file path where the audio should be stored temporarily
 */
export function getTempAudioPath(lectureId: string): string {
  return path.join(getTempPath(), `${lectureId}.m4a`);
}

/**
 * Save audio content to a temp file.
 * Creates the directory structure if it doesn't exist.
 *
 * @param lectureId - The lecture ID
 * @param audioBytes - The audio content as Uint8Array or Buffer
 * @returns The file path where the audio was stored
 */
export async function saveTempAudio(
  lectureId: string,
  audioBytes: Uint8Array | Buffer
): Promise<string> {
  await ensureTempDir();

  const filePath = getTempAudioPath(lectureId);
  await fs.writeFile(filePath, audioBytes);
  return filePath;
}

/**
 * Check if a temp audio file exists.
 *
 * @param lectureId - The lecture ID
 * @returns True if the temp audio file exists
 */
export async function tempAudioExists(lectureId: string): Promise<boolean> {
  const filePath = getTempAudioPath(lectureId);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete a temp audio file after processing is complete.
 * Does not throw if the file doesn't exist.
 *
 * @param lectureId - The lecture ID
 */
export async function cleanupTempAudio(lectureId: string): Promise<void> {
  const filePath = getTempAudioPath(lectureId);
  try {
    await fs.unlink(filePath);
  } catch (error) {
    // Ignore errors if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
}
