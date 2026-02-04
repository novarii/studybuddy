/**
 * RunPod transcription client for faster-whisper worker.
 *
 * This client submits audio files to RunPod's serverless API for transcription
 * using the faster-whisper model, then polls for results.
 *
 * @see https://github.com/runpod-workers/worker-faster_whisper
 */

import {
  TranscriptionResult,
  TranscriptionError,
  RunPodConfig,
} from './types';

const RUNPOD_BASE_URL = 'https://api.runpod.ai/v2';

/**
 * Default configuration for RunPod faster-whisper transcription.
 */
export const RUNPOD_CONFIG: RunPodConfig = {
  model: 'small',
  language: 'en',
  transcription: 'plain_text',
  word_timestamps: true,
  enable_vad: false,
};

/**
 * Get RunPod configuration from environment variables.
 * Throws TranscriptionError if required variables are missing.
 */
function getRunPodConfig(): { apiKey: string; endpointId: string } {
  const apiKey = process.env.RUNPOD_API_KEY;
  const endpointId = process.env.RUNPOD_ENDPOINT_ID;

  if (!apiKey) {
    throw new TranscriptionError(
      'RUNPOD_API_KEY environment variable is not set',
      'MISSING_API_KEY'
    );
  }

  if (!endpointId) {
    throw new TranscriptionError(
      'RUNPOD_ENDPOINT_ID environment variable is not set',
      'MISSING_ENDPOINT_ID'
    );
  }

  return { apiKey, endpointId };
}

/**
 * Submit a transcription job to RunPod.
 *
 * @param audioBase64 - Base64-encoded audio data
 * @returns The job ID for polling
 * @throws TranscriptionError on failure
 */
export async function submitTranscriptionJob(
  audioBase64: string
): Promise<string> {
  const { apiKey, endpointId } = getRunPodConfig();

  const url = `${RUNPOD_BASE_URL}/${endpointId}/run`;

  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          audio_base64: audioBase64,
          model: RUNPOD_CONFIG.model,
          language: RUNPOD_CONFIG.language,
          transcription: RUNPOD_CONFIG.transcription,
          word_timestamps: RUNPOD_CONFIG.word_timestamps,
          enable_vad: RUNPOD_CONFIG.enable_vad,
        },
      }),
    });
  } catch (error) {
    throw new TranscriptionError(
      `Failed to submit transcription job: ${error instanceof Error ? error.message : 'Unknown error'}`,
      'SUBMIT_FAILED'
    );
  }

  if (!response.ok) {
    throw new TranscriptionError(
      `Failed to submit transcription job: ${response.statusText}`,
      'SUBMIT_FAILED'
    );
  }

  const data = await response.json();

  if (!data.id) {
    throw new TranscriptionError(
      'RunPod response missing job ID',
      'INVALID_RESPONSE'
    );
  }

  return data.id;
}

/**
 * Options for polling.
 */
export interface PollOptions {
  /** Maximum number of polling attempts (default: 120 = 10 minutes at 5s intervals) */
  maxAttempts?: number;
  /** Interval between polls in milliseconds (default: 5000) */
  intervalMs?: number;
}

/**
 * Poll RunPod for transcription job result.
 *
 * @param jobId - The job ID from submitTranscriptionJob
 * @param options - Polling options
 * @returns The transcription result
 * @throws TranscriptionError on failure or timeout
 */
export async function pollForResult(
  jobId: string,
  options: PollOptions = {}
): Promise<TranscriptionResult> {
  const { apiKey, endpointId } = getRunPodConfig();
  const maxAttempts = options.maxAttempts ?? 120;
  const intervalMs = options.intervalMs ?? 5000;

  const url = `${RUNPOD_BASE_URL}/${endpointId}/status/${jobId}`;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
    } catch (error) {
      throw new TranscriptionError(
        `Failed to poll transcription status: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'POLL_FAILED'
      );
    }

    if (!response.ok) {
      throw new TranscriptionError(
        `Failed to poll transcription status: ${response.statusText}`,
        'POLL_FAILED'
      );
    }

    const data = await response.json();

    switch (data.status) {
      case 'COMPLETED':
        if (!data.output) {
          throw new TranscriptionError(
            'RunPod completed but returned no output',
            'INVALID_OUTPUT'
          );
        }
        return data.output;

      case 'FAILED':
        throw new TranscriptionError(
          `Transcription failed: ${data.error || 'Unknown error'}`,
          'TRANSCRIPTION_FAILED'
        );

      case 'IN_QUEUE':
      case 'IN_PROGRESS':
        // Continue polling
        break;

      default:
        // Unknown status, continue polling
        break;
    }

    // Wait before next poll attempt
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  throw new TranscriptionError(
    `Transcription timeout after ${maxAttempts} attempts`,
    'TIMEOUT'
  );
}

/**
 * Options for transcription.
 */
export interface TranscribeOptions {
  /** Maximum number of polling attempts (default: 120) */
  maxPollAttempts?: number;
  /** Interval between polls in milliseconds (default: 5000) */
  pollIntervalMs?: number;
}

/**
 * Transcribe audio using RunPod faster-whisper.
 *
 * This is the high-level function that combines job submission and polling.
 *
 * @param audioBase64 - Base64-encoded audio data
 * @param options - Transcription options
 * @returns The transcription result with text, segments, and language
 * @throws TranscriptionError on failure
 *
 * @example
 * ```typescript
 * import { readFileSync } from 'fs';
 *
 * const audioBuffer = readFileSync('lecture.m4a');
 * const audioBase64 = audioBuffer.toString('base64');
 *
 * const result = await transcribeAudio(audioBase64);
 * console.log(result.transcription);
 * console.log(result.segments.length, 'segments');
 * ```
 */
export async function transcribeAudio(
  audioBase64: string,
  options: TranscribeOptions = {}
): Promise<TranscriptionResult> {
  const jobId = await submitTranscriptionJob(audioBase64);

  return pollForResult(jobId, {
    maxAttempts: options.maxPollAttempts,
    intervalMs: options.pollIntervalMs,
  });
}
