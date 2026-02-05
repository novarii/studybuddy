import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'fs';

// Mock fs.readFile
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
}));

// Mock environment variables before importing the module
vi.stubEnv('GROQ_API_KEY', 'test-groq-api-key');

import { transcribeAudio } from '@/lib/lectures/groq-client';
import { TranscriptionError } from '@/lib/lectures/types';

describe('Groq Transcription Client', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();
  const mockReadFile = vi.mocked(fs.readFile);

  const mockGroqResponse = {
    text: "Hello, welcome to today's lecture.",
    language: 'en',
    duration: 4.2,
    segments: [
      {
        id: 0,
        seek: 0,
        start: 0.0,
        end: 2.5,
        text: ' Hello, welcome to',
        tokens: [1, 2, 3],
        temperature: 0,
        avg_logprob: -0.1,
        compression_ratio: 1.5,
        no_speech_prob: 0.01,
      },
      {
        id: 1,
        seek: 250,
        start: 2.5,
        end: 4.2,
        text: " today's lecture.",
        tokens: [4, 5, 6],
        temperature: 0,
        avg_logprob: -0.15,
        compression_ratio: 1.4,
        no_speech_prob: 0.02,
      },
    ],
  };

  const sampleAudioPath = '/tmp/lectures/lecture-123.mp3';
  const mockAudioBuffer = Buffer.from([0xff, 0xfb, 0x90, 0x00]); // MP3 header

  beforeEach(() => {
    global.fetch = mockFetch;
    vi.stubEnv('GROQ_API_KEY', 'test-groq-api-key');
    mockReadFile.mockResolvedValue(mockAudioBuffer);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    mockFetch.mockReset();
    mockReadFile.mockReset();
  });

  describe('transcribeAudio', () => {
    it('should transcribe audio and return formatted result', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGroqResponse,
      } as Response);

      const result = await transcribeAudio(sampleAudioPath);

      expect(result.transcription).toBe("Hello, welcome to today's lecture.");
      expect(result.detected_language).toBe('en');
      expect(result.segments).toHaveLength(2);
      expect(result.segments[0]).toEqual({
        id: 0,
        start: 0.0,
        end: 2.5,
        text: 'Hello, welcome to',
      });
      expect(result.segments[1]).toEqual({
        id: 1,
        start: 2.5,
        end: 4.2,
        text: "today's lecture.",
      });
    });

    it('should read file and call Groq API with correct parameters', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockGroqResponse,
      } as Response);

      await transcribeAudio(sampleAudioPath);

      // Verify file was read
      expect(mockReadFile).toHaveBeenCalledWith(sampleAudioPath);

      // Verify API call
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.groq.com/openai/v1/audio/transcriptions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer test-groq-api-key',
          }),
        })
      );

      // Verify FormData contains expected fields
      const call = mockFetch.mock.calls[0];
      const body = call[1].body as FormData;
      expect(body.get('file')).toBeTruthy();
      expect(body.get('model')).toBe('whisper-large-v3-turbo');
      expect(body.get('response_format')).toBe('verbose_json');
      expect(body.get('language')).toBe('en');
    });

    it('should throw TranscriptionError when API key is missing', async () => {
      vi.stubEnv('GROQ_API_KEY', '');

      const error = await transcribeAudio(sampleAudioPath).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('GROQ_API_KEY environment variable is not set');
      expect(error.code).toBe('MISSING_API_KEY');
    });

    it('should throw TranscriptionError when file read fails', async () => {
      mockReadFile.mockRejectedValueOnce(new Error('ENOENT: no such file'));

      const error = await transcribeAudio(sampleAudioPath).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toContain('Failed to read audio file');
      expect(error.code).toBe('FILE_READ_FAILED');
    });

    it('should throw TranscriptionError on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key',
      } as Response);

      const error = await transcribeAudio(sampleAudioPath).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toContain('Groq transcription failed');
      expect(error.message).toContain('Invalid API key');
      expect(error.code).toBe('TRANSCRIPTION_FAILED');
    });

    it('should throw TranscriptionError on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const error = await transcribeAudio(sampleAudioPath).catch((e) => e);
      expect(error).toBeInstanceOf(TranscriptionError);
      expect(error.message).toBe('Failed to connect to Groq API: Network error');
      expect(error.code).toBe('CONNECTION_FAILED');
    });

    it('should handle empty transcription result', async () => {
      const emptyResponse = {
        text: '',
        language: 'en',
        duration: 0,
        segments: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => emptyResponse,
      } as Response);

      const result = await transcribeAudio(sampleAudioPath);

      expect(result.transcription).toBe('');
      expect(result.segments).toHaveLength(0);
    });

    it('should handle missing language in response', async () => {
      const responseNoLang = {
        text: 'Some text',
        duration: 1.0,
        segments: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseNoLang,
      } as Response);

      const result = await transcribeAudio(sampleAudioPath);

      expect(result.detected_language).toBe('en'); // Default fallback
    });

    it('should trim segment text', async () => {
      const responseWithWhitespace = {
        text: 'Test',
        language: 'en',
        duration: 1.0,
        segments: [
          {
            id: 0,
            seek: 0,
            start: 0,
            end: 1,
            text: '  Test with spaces  ',
            tokens: [],
            temperature: 0,
            avg_logprob: -0.1,
            compression_ratio: 1.5,
            no_speech_prob: 0.01,
          },
        ],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => responseWithWhitespace,
      } as Response);

      const result = await transcribeAudio(sampleAudioPath);

      expect(result.segments[0].text).toBe('Test with spaces');
    });
  });
});
