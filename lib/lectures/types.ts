/**
 * Types for lecture transcription and processing.
 */

/**
 * A single segment from Whisper transcription with timestamps.
 */
export interface WhisperSegment {
  /** Segment index */
  id: number;
  /** Start time in seconds */
  start: number;
  /** End time in seconds */
  end: number;
  /** Transcribed text for this segment */
  text: string;
}

/**
 * Complete transcription result from RunPod faster-whisper.
 */
export interface TranscriptionResult {
  /** Full transcript text */
  transcription: string;
  /** Segments with timestamps */
  segments: WhisperSegment[];
  /** Detected language code */
  detected_language: string;
}

/**
 * RunPod job submission response.
 */
export interface RunPodJobResponse {
  /** Unique job identifier */
  id: string;
  /** Initial job status */
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
}

/**
 * RunPod job status response.
 */
export interface RunPodStatusResponse {
  /** Job identifier */
  id: string;
  /** Current job status */
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  /** Output when status is COMPLETED */
  output?: TranscriptionResult;
  /** Error message when status is FAILED */
  error?: string;
}

/**
 * Configuration for RunPod transcription requests.
 */
export interface RunPodConfig {
  /** Whisper model to use (e.g., 'small', 'medium', 'large') */
  model: string;
  /** Language code (e.g., 'en') */
  language: string;
  /** Transcription format */
  transcription: 'plain_text' | 'srt' | 'vtt';
  /** Whether to include word-level timestamps */
  word_timestamps: boolean;
  /** Whether to enable voice activity detection */
  enable_vad: boolean;
}

/**
 * Error thrown when transcription fails.
 */
export class TranscriptionError extends Error {
  constructor(
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = 'TranscriptionError';
  }
}
