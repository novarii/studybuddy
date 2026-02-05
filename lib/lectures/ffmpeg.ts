/**
 * FFmpeg integration for audio extraction from video files and HLS streams.
 *
 * This module provides utilities to:
 * - Download and extract audio from HLS streams (for Panopto fallback path)
 * - Extract audio from local video files
 * - Probe audio duration using ffprobe
 *
 * @see https://ffmpeg.org/ffmpeg.html
 */

import { spawn as nodeSpawn } from 'child_process';
import type { ChildProcess } from 'child_process';
import pLimit from 'p-limit';

/**
 * Concurrency limiter for FFmpeg downloads.
 * Allows up to 4 concurrent FFmpeg processes.
 */
const ffmpegLimit = pLimit(4);

/**
 * Type for spawn function - allows injection for testing.
 */
type SpawnFn = (command: string, args: string[]) => ChildProcess;

/**
 * Internal spawn function - can be overridden for testing.
 * @internal
 */
let _spawn: SpawnFn = nodeSpawn;

/**
 * Set the spawn function (for testing).
 * @internal
 */
export function _setSpawn(fn: SpawnFn): void {
  _spawn = fn;
}

/**
 * Reset spawn to the real implementation.
 * @internal
 */
export function _resetSpawn(): void {
  _spawn = nodeSpawn;
}

/**
 * Error thrown when FFmpeg operations fail.
 */
export class FFmpegError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = 'FFmpegError';
  }
}

/**
 * Result from FFmpeg audio extraction operations.
 */
export interface FFmpegResult {
  /** Path to the output audio file */
  outputPath: string;
  /** Duration of the audio in seconds (0 if unknown) */
  durationSeconds: number;
}

/**
 * Get audio duration using ffprobe.
 *
 * Returns 0 if duration cannot be determined (file doesn't exist,
 * ffprobe not available, or invalid audio format).
 *
 * @param audioPath - Path to the audio file
 * @returns Duration in seconds (rounded to nearest integer), or 0 on failure
 *
 * @example
 * ```typescript
 * const duration = await probeDuration('/path/to/audio.m4a');
 * console.log(`Audio is ${duration} seconds long`);
 * ```
 */
export async function probeDuration(audioPath: string): Promise<number> {
  return new Promise((resolve) => {
    const ffprobe = _spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    let output = '';

    ffprobe.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          resolve(0);
        } else {
          resolve(Math.round(duration));
        }
      } else {
        resolve(0);
      }
    });

    ffprobe.on('error', () => {
      resolve(0);
    });
  });
}

/**
 * Extract audio from a local video file.
 *
 * Uses FFmpeg to extract audio track and encode as AAC.
 * Use this when the video is already downloaded locally.
 *
 * @param videoPath - Path to the input video file
 * @param outputPath - Path where the audio file will be saved
 * @returns FFmpegResult with output path and duration
 * @throws FFmpegError on failure
 *
 * @example
 * ```typescript
 * const result = await extractAudioFromFile(
 *   '/tmp/lecture.mp4',
 *   '/tmp/lecture-audio.m4a'
 * );
 * console.log(`Extracted ${result.durationSeconds}s of audio`);
 * ```
 */
export async function extractAudioFromFile(
  videoPath: string,
  outputPath: string
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const ffmpeg = _spawn('ffmpeg', [
      '-y',              // Overwrite output file if exists
      '-i', videoPath,   // Input file
      '-vn',             // No video
      '-acodec', 'aac',  // Audio codec
      '-b:a', '128k',    // Audio bitrate
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        const durationSeconds = await probeDuration(outputPath);
        resolve({ outputPath, durationSeconds });
      } else {
        // Truncate stderr to last 500 characters for readability
        const truncatedStderr = stderr.slice(-500);
        reject(
          new FFmpegError(
            `FFmpeg failed (code ${code}): ${truncatedStderr}`,
            'FFMPEG_FAILED'
          )
        );
      }
    });

    ffmpeg.on('error', (err) => {
      reject(
        new FFmpegError(
          `FFmpeg not found: ${err.message}`,
          'FFMPEG_NOT_FOUND'
        )
      );
    });
  });
}

/**
 * Download HLS stream and extract audio in one step.
 *
 * FFmpeg handles HLS natively - it will:
 * 1. Parse the .m3u8 playlist
 * 2. Download all .ts segments
 * 3. Handle any AES encryption
 * 4. Copy audio stream without re-encoding (fast!)
 *
 * Uses optimized flags for faster startup and audio-only extraction.
 * Concurrency is limited to 4 simultaneous downloads via p-limit.
 *
 * @param streamUrl - HLS stream URL (e.g., CloudFront pre-signed URL ending in .m3u8)
 * @param outputPath - Path where the audio file will be saved
 * @returns FFmpegResult with output path and duration
 * @throws FFmpegError on failure
 *
 * @example
 * ```typescript
 * const result = await downloadAndExtractAudio(
 *   'https://cloudfront.../master.m3u8?Policy=...',
 *   '/tmp/lecture-audio.m4a'
 * );
 * console.log(`Downloaded and extracted ${result.durationSeconds}s of audio`);
 * ```
 */
export async function downloadAndExtractAudio(
  streamUrl: string,
  outputPath: string
): Promise<FFmpegResult> {
  return ffmpegLimit(() => _downloadAndExtractAudio(streamUrl, outputPath));
}

/**
 * Internal implementation of audio extraction (without concurrency limiting).
 * @internal
 */
async function _downloadAndExtractAudio(
  streamUrl: string,
  outputPath: string
): Promise<FFmpegResult> {
  return new Promise((resolve, reject) => {
    const ffmpeg = _spawn('ffmpeg', [
      '-analyzeduration', '0',  // Skip duration analysis (faster startup)
      '-probesize', '32',       // Minimal probe size (faster startup)
      '-i', streamUrl,          // HLS URL - FFmpeg handles .m3u8 natively
      '-map', '0:a:0',          // Select first audio stream
      '-ar', '16000',           // 16kHz sample rate (Groq recommendation)
      '-ac', '1',               // Mono (Groq recommendation)
      '-c:a', 'libmp3lame',     // MP3 codec (much smaller than FLAC)
      '-b:a', '32k',            // 32kbps is plenty for speech (Whisper handles it fine)
      '-y',                     // Overwrite output file if exists
      outputPath,
    ]);

    let stderr = '';

    ffmpeg.stderr?.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    ffmpeg.on('close', async (code) => {
      if (code === 0) {
        const durationSeconds = await probeDuration(outputPath);
        resolve({ outputPath, durationSeconds });
      } else {
        // Truncate stderr to last 500 characters for readability
        const truncatedStderr = stderr.slice(-500);
        reject(
          new FFmpegError(
            `FFmpeg failed (code ${code}): ${truncatedStderr}`,
            'FFMPEG_FAILED'
          )
        );
      }
    });

    ffmpeg.on('error', (err) => {
      reject(
        new FFmpegError(
          `FFmpeg not found: ${err.message}`,
          'FFMPEG_NOT_FOUND'
        )
      );
    });
  });
}
