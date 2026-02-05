/**
 * Groq transcription client for Whisper speech-to-text.
 *
 * Uses Groq's fast serverless API for transcription - 216x real-time speed,
 * pay only for audio minutes processed ($0.04/hour).
 *
 * Automatically uses chunking for files over 20MB (Groq limit is 25MB).
 *
 * @see https://console.groq.com/docs/speech-text
 */

import Groq from 'groq-sdk';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

import {
  TranscriptionResult,
  TranscriptionError,
  WhisperSegment,
} from './types';
import { transcribeWithChunking } from './audio-chunking';

/**
 * Groq Whisper model to use.
 * whisper-large-v3-turbo: Fast, cheap ($0.04/hr), good quality
 */
const GROQ_MODEL = 'whisper-large-v3-turbo';

/**
 * Maximum file size for direct upload.
 * Set to 10MB since we experienced connection issues at 18MB.
 */
const MAX_DIRECT_UPLOAD_SIZE = 10 * 1024 * 1024;

/**
 * Get Groq client instance.
 * @throws TranscriptionError if API key not configured
 */
function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    throw new TranscriptionError(
      'GROQ_API_KEY environment variable is not set',
      'MISSING_API_KEY'
    );
  }

  return new Groq({
    apiKey,
    timeout: 5 * 60 * 1000, // 5 minute timeout for large files
  });
}

/**
 * Transcribe audio using Groq's Whisper API.
 *
 * Uploads the audio file directly to Groq for transcription.
 * Groq processes at 216x real-time - a 1hr lecture takes ~17 seconds.
 *
 * @param audioFilePath - Local path to the audio file
 * @returns Transcription result with text, segments, and language
 * @throws TranscriptionError on failure
 *
 * @example
 * ```typescript
 * const result = await transcribeAudio('/tmp/lectures/abc123.mp3');
 * console.log(result.transcription);
 * console.log(result.segments.length, 'segments');
 * ```
 */
export async function transcribeAudio(
  audioFilePath: string
): Promise<TranscriptionResult> {
  // Get file size
  let fileSize: number;
  try {
    const stats = await stat(audioFilePath);
    fileSize = stats.size;
  } catch (error) {
    throw new TranscriptionError(
      `Failed to read audio file: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'FILE_READ_FAILED'
    );
  }

  const fileName = audioFilePath.split('/').pop() || 'audio.mp3';
  const fileSizeMB = fileSize / 1024 / 1024;

  // Use chunking for large files
  if (fileSize > MAX_DIRECT_UPLOAD_SIZE) {
    console.log(`[Groq] File ${fileName} is ${fileSizeMB.toFixed(2)}MB - using chunking`);
    return transcribeWithChunking(audioFilePath);
  }

  // Direct upload for small files
  console.log('[Groq] Uploading file:', fileName, 'size:', fileSizeMB.toFixed(2), 'MB');

  const groq = getGroqClient();

  try {
    // Use fs.createReadStream as recommended in Groq SDK docs
    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(audioFilePath),
      model: GROQ_MODEL,
      response_format: 'verbose_json',
      language: 'en',
      temperature: 0,
    });

    // The response type for verbose_json includes segments
    const response = transcription as unknown as {
      text: string;
      language?: string;
      segments?: Array<{
        id: number;
        start: number;
        end: number;
        text: string;
      }>;
    };

    // Map segments to our WhisperSegment format
    const segments: WhisperSegment[] = (response.segments || []).map((seg) => ({
      id: seg.id,
      start: seg.start,
      end: seg.end,
      text: seg.text.trim(),
    }));

    return {
      transcription: response.text,
      segments,
      detected_language: response.language || 'en',
    };
  } catch (error) {
    console.error('[Groq] Full error:', error);

    if (error instanceof Groq.APIError) {
      console.error('[Groq] API Error:', error.status, error.message);
      throw new TranscriptionError(
        `Groq transcription failed: ${error.message}`,
        'TRANSCRIPTION_FAILED'
      );
    }

    // Log full error details for debugging
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : '';
    console.error('[Groq] Connection error details:', errorMessage, errorStack);

    throw new TranscriptionError(
      `Failed to connect to Groq API: ${errorMessage}`,
      'CONNECTION_FAILED'
    );
  }
}
