import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing the module
vi.stubEnv('RUNPOD_API_KEY', 'test-runpod-api-key');
vi.stubEnv('RUNPOD_ENDPOINT_ID', 'test-endpoint-id');

import {
  submitTranscriptionJob,
  pollForResult,
  transcribeAudio,
  RUNPOD_CONFIG,
} from '@/lib/lectures/runpod-client';
import { TranscriptionError } from '@/lib/lectures/types';

describe('RunPod Transcription Client', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  const mockTranscriptionResult = {
    transcription: 'Hello, welcome to today\'s lecture.',
    segments: [
      { id: 0, start: 0.0, end: 2.5, text: 'Hello, welcome to' },
      { id: 1, start: 2.5, end: 4.2, text: 'today\'s lecture.' },
    ],
    detected_language: 'en',
  };

  const sampleAudioUrl = 'https://example.com/api/lectures/audio/lecture-123';

  beforeEach(() => {
    global.fetch = mockFetch;
    vi.stubEnv('RUNPOD_API_KEY', 'test-runpod-api-key');
    vi.stubEnv('RUNPOD_ENDPOINT_ID', 'test-endpoint-id');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    mockFetch.mockReset();
  });

  describe('RUNPOD_CONFIG', () => {
    it('should have expected default configuration', () => {
      expect(RUNPOD_CONFIG).toEqual({
        model: 'small',
        language: 'en',
        transcription: 'plain_text',
        word_timestamps: true,
        enable_vad: false,
      });
    });
  });

  describe('submitTranscriptionJob', () => {
    it('should submit a job and return job ID', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-123', status: 'IN_QUEUE' }),
      } as Response);

      const result = await submitTranscriptionJob(sampleAudioUrl);

      expect(result).toBe('job-123');
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.runpod.ai/v2/test-endpoint-id/run',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-runpod-api-key',
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify request body contains expected fields
      const call = mockFetch.mock.calls[0];
      const body = JSON.parse(call[1].body);
      expect(body.input).toEqual({
        audio: sampleAudioUrl,
        model: 'small',
        language: 'en',
        transcription: 'plain_text',
        word_timestamps: true,
        enable_vad: false,
      });
    });

    it('should throw TranscriptionError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      } as Response);

      const error = await submitTranscriptionJob(sampleAudioUrl).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Failed to submit transcription job: Unauthorized - Invalid API key');
    });

    it('should throw TranscriptionError when job ID is missing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ status: 'IN_QUEUE' }), // Missing id
      } as Response);

      const error = await submitTranscriptionJob(sampleAudioUrl).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('RunPod response missing job ID');
    });

    it('should throw TranscriptionError when API key is missing', async () => {
      vi.stubEnv('RUNPOD_API_KEY', '');

      const error = await submitTranscriptionJob(sampleAudioUrl).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('RUNPOD_API_KEY environment variable is not set');
    });

    it('should throw TranscriptionError when endpoint ID is missing', async () => {
      vi.stubEnv('RUNPOD_ENDPOINT_ID', '');

      const error = await submitTranscriptionJob(sampleAudioUrl).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('RUNPOD_ENDPOINT_ID environment variable is not set');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const error = await submitTranscriptionJob(sampleAudioUrl).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Failed to submit transcription job: Network error');
    });
  });

  describe('pollForResult', () => {
    it('should return result when job is completed', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-123',
          status: 'COMPLETED',
          output: mockTranscriptionResult,
        }),
      } as Response);

      const result = await pollForResult('job-123');

      expect(result).toEqual(mockTranscriptionResult);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.runpod.ai/v2/test-endpoint-id/status/job-123',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-runpod-api-key',
          }),
        })
      );
    });

    it('should poll until job is completed', async () => {
      // First call: IN_QUEUE
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-123', status: 'IN_QUEUE' }),
      } as Response);

      // Second call: IN_PROGRESS
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-123', status: 'IN_PROGRESS' }),
      } as Response);

      // Third call: COMPLETED
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-123',
          status: 'COMPLETED',
          output: mockTranscriptionResult,
        }),
      } as Response);

      const result = await pollForResult('job-123', {
        maxAttempts: 5,
        intervalMs: 10, // Use short interval for tests
      });

      expect(result).toEqual(mockTranscriptionResult);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should throw TranscriptionError on FAILED status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-123',
          status: 'FAILED',
          error: 'Audio file is corrupted',
        }),
      } as Response);

      const error = await pollForResult('job-123').catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Transcription failed: Audio file is corrupted');
    });

    it('should throw TranscriptionError on timeout', async () => {
      // Always return IN_PROGRESS
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ id: 'job-123', status: 'IN_PROGRESS' }),
      } as Response);

      const error = await pollForResult('job-123', { maxAttempts: 3, intervalMs: 10 }).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Transcription timeout after 3 attempts');
    });

    it('should throw TranscriptionError on non-ok status response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      } as Response);

      const error = await pollForResult('job-123').catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Failed to poll transcription status: Internal Server Error');
    });

    it('should handle missing output on COMPLETED status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-123',
          status: 'COMPLETED',
          // Missing output field
        }),
      } as Response);

      const error = await pollForResult('job-123').catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('RunPod completed but returned no output');
    });
  });

  describe('transcribeAudio', () => {
    it('should submit job and poll until completion', async () => {
      // Submit response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-456', status: 'IN_QUEUE' }),
      } as Response);

      // Poll response - completed immediately
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-456',
          status: 'COMPLETED',
          output: mockTranscriptionResult,
        }),
      } as Response);

      const result = await transcribeAudio(sampleAudioUrl);

      expect(result).toEqual(mockTranscriptionResult);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors from submitTranscriptionJob', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid input',
      } as Response);

      await expect(transcribeAudio(sampleAudioUrl)).rejects.toThrow(
        TranscriptionError
      );
    });

    it('should propagate errors from pollForResult', async () => {
      // Submit succeeds
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-789', status: 'IN_QUEUE' }),
      } as Response);

      // Poll fails
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-789',
          status: 'FAILED',
          error: 'Worker crashed',
        }),
      } as Response);

      await expect(transcribeAudio(sampleAudioUrl)).rejects.toThrow(
        'Transcription failed: Worker crashed'
      );
    });

    it('should handle end-to-end transcription with multiple polling attempts', async () => {
      // Submit response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-end-to-end', status: 'IN_QUEUE' }),
      } as Response);

      // Poll 1: IN_QUEUE
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-end-to-end', status: 'IN_QUEUE' }),
      } as Response);

      // Poll 2: IN_PROGRESS
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-end-to-end', status: 'IN_PROGRESS' }),
      } as Response);

      // Poll 3: COMPLETED
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-end-to-end',
          status: 'COMPLETED',
          output: mockTranscriptionResult,
        }),
      } as Response);

      const result = await transcribeAudio(sampleAudioUrl, {
        pollIntervalMs: 10,
      });

      expect(result).toEqual(mockTranscriptionResult);
      expect(mockFetch).toHaveBeenCalledTimes(4); // 1 submit + 3 polls
    });
  });

  describe('edge cases', () => {
    it('should handle empty transcription result', async () => {
      const emptyResult = {
        transcription: '',
        segments: [],
        detected_language: 'en',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-empty', status: 'IN_QUEUE' }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-empty',
          status: 'COMPLETED',
          output: emptyResult,
        }),
      } as Response);

      const result = await transcribeAudio(sampleAudioUrl);

      expect(result).toEqual(emptyResult);
      expect(result.transcription).toBe('');
      expect(result.segments).toHaveLength(0);
    });

    it('should handle segments with varied timestamps', async () => {
      const variedSegments = {
        transcription: 'First segment. Second segment. Third segment.',
        segments: [
          { id: 0, start: 0.0, end: 1.5, text: 'First segment.' },
          { id: 1, start: 1.5, end: 3.0, text: 'Second segment.' },
          { id: 2, start: 10.5, end: 15.2, text: 'Third segment.' }, // Gap in audio
        ],
        detected_language: 'en',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-varied', status: 'IN_QUEUE' }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-varied',
          status: 'COMPLETED',
          output: variedSegments,
        }),
      } as Response);

      const result = await transcribeAudio(sampleAudioUrl);

      expect(result.segments).toHaveLength(3);
      expect(result.segments[2].start).toBe(10.5);
      expect(result.segments[2].end).toBe(15.2);
    });

    it('should handle non-English detected language', async () => {
      const spanishResult = {
        transcription: 'Hola, bienvenidos a la clase.',
        segments: [{ id: 0, start: 0.0, end: 3.0, text: 'Hola, bienvenidos a la clase.' }],
        detected_language: 'es',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'job-spanish', status: 'IN_QUEUE' }),
      } as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          id: 'job-spanish',
          status: 'COMPLETED',
          output: spanishResult,
        }),
      } as Response);

      const result = await transcribeAudio(sampleAudioUrl);

      expect(result.detected_language).toBe('es');
    });
  });
});
