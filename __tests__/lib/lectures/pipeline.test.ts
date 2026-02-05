import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables before importing modules
vi.stubEnv('RUNPOD_API_KEY', 'test-runpod-api-key');
vi.stubEnv('RUNPOD_ENDPOINT_ID', 'test-endpoint-id');
vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');
vi.stubEnv('LECTURE_TEMP_PATH', '/tmp/test-lectures');
vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test-app.example.com');

// Mock database - define mocks first, then use in vi.mock
vi.mock('@/lib/db', () => {
  const mockUpdate = vi.fn();
  const mockSet = vi.fn();
  const mockWhere = vi.fn();
  const mockExecute = vi.fn();

  // Chain returns
  mockUpdate.mockReturnValue({ set: mockSet });
  mockSet.mockReturnValue({ where: mockWhere });
  mockWhere.mockResolvedValue(undefined);
  mockExecute.mockResolvedValue(undefined);

  return {
    db: {
      update: mockUpdate,
      execute: mockExecute,
    },
    lectures: { id: 'lectures.id' },
  };
});

// Mock temp files
vi.mock('@/lib/lectures/temp-files', () => ({
  getTempAudioPath: vi.fn((id: string) => `/tmp/test-lectures/${id}.m4a`),
  cleanupTempAudio: vi.fn().mockResolvedValue(undefined),
}));

// Mock RunPod client
vi.mock('@/lib/lectures/runpod-client', () => ({
  transcribeAudio: vi.fn(),
}));

// Mock FFmpeg
vi.mock('@/lib/lectures/ffmpeg', () => ({
  downloadAndExtractAudio: vi.fn(),
  probeDuration: vi.fn().mockResolvedValue(3600),
}));

// Mock normalization
vi.mock('@/lib/lectures/normalize', () => ({
  normalizeTranscript: vi.fn((segments) => segments),
}));

// Mock chunking
vi.mock('@/lib/lectures/chunking', () => ({
  chunkTranscript: vi.fn(),
}));

// Mock embeddings
vi.mock('@/lib/ai/embeddings', () => ({
  embedBatch: vi.fn(),
}));

// Mock getUserApiKey
vi.mock('@/lib/api-keys/get-user-api-key', () => ({
  getUserApiKey: vi.fn().mockResolvedValue('test-api-key'),
}));


import { db, lectures } from '@/lib/db';
import { transcribeAudio } from '@/lib/lectures/runpod-client';
import { downloadAndExtractAudio } from '@/lib/lectures/ffmpeg';
import { chunkTranscript, type TimestampedChunk } from '@/lib/lectures/chunking';
import { embedBatch } from '@/lib/ai/embeddings';
import { cleanupTempAudio } from '@/lib/lectures/temp-files';

import {
  processLecture,
  downloadAndProcessLecture,
  updateLectureStatus,
  ingestChunks,
  type LectureStatusUpdate,
} from '@/lib/lectures/pipeline';

describe('Lecture Pipeline', () => {
  const mockLectureId = '550e8400-e29b-41d4-a716-446655440000';
  const mockUserId = 'user_123';
  const mockCourseId = '660e8400-e29b-41d4-a716-446655440001';

  const mockSegments = [
    { id: 0, start: 0.0, end: 10.0, text: 'Hello, welcome to the lecture.' },
    { id: 1, start: 10.0, end: 20.0, text: 'Today we will discuss machine learning.' },
    { id: 2, start: 20.0, end: 30.0, text: 'Let us start with neural networks.' },
  ];

  const mockTranscriptionResult = {
    transcription: 'Hello, welcome to the lecture. Today we will discuss machine learning. Let us start with neural networks.',
    segments: mockSegments,
    detected_language: 'en',
  };

  const mockChunks: TimestampedChunk[] = [
    {
      title: 'Introduction',
      text: 'Hello, welcome to the lecture.',
      start_seconds: 0.0,
      end_seconds: 10.0,
      chunk_index: 0,
      segment_ids: [0],
    },
    {
      title: 'Machine Learning Overview',
      text: 'Today we will discuss machine learning. Let us start with neural networks.',
      start_seconds: 10.0,
      end_seconds: 30.0,
      chunk_index: 1,
      segment_ids: [1, 2],
    },
  ];

  const mockEmbeddings = [
    [0.1, 0.2, 0.3], // 1536 dims in reality
    [0.4, 0.5, 0.6],
  ];

  // Get typed mocks
  const mockTranscribeAudio = transcribeAudio as ReturnType<typeof vi.fn>;
  const mockChunkTranscript = chunkTranscript as ReturnType<typeof vi.fn>;
  const mockEmbedBatch = embedBatch as ReturnType<typeof vi.fn>;
  const mockDownloadAndExtractAudio = downloadAndExtractAudio as ReturnType<typeof vi.fn>;
  const mockCleanupTempAudio = cleanupTempAudio as ReturnType<typeof vi.fn>;
  const mockDbUpdate = db.update as ReturnType<typeof vi.fn>;
  const mockDbExecute = db.execute as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Re-stub env vars (cleared by afterEach)
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://test-app.example.com');

    // Reset chained mocks
    const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
    mockDbUpdate.mockReturnValue({ set: mockSet });
    mockDbExecute.mockResolvedValue(undefined);

    mockTranscribeAudio.mockResolvedValue(mockTranscriptionResult);
    mockChunkTranscript.mockResolvedValue(mockChunks);
    mockEmbedBatch.mockResolvedValue(mockEmbeddings);
    mockDownloadAndExtractAudio.mockResolvedValue({
      outputPath: `/tmp/test-lectures/${mockLectureId}.m4a`,
      durationSeconds: 3600,
    });
    mockCleanupTempAudio.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('updateLectureStatus', () => {
    it('should update lecture status in database', async () => {
      const update: LectureStatusUpdate = {
        status: 'transcribing',
      };

      await updateLectureStatus(mockLectureId, update);

      expect(mockDbUpdate).toHaveBeenCalledWith(lectures);
    });

    it('should include updatedAt timestamp', async () => {
      const mockSet = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: mockSet });

      const update: LectureStatusUpdate = {
        status: 'completed',
        chunkCount: 5,
      };

      await updateLectureStatus(mockLectureId, update);

      expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
        status: 'completed',
        chunkCount: 5,
        updatedAt: expect.any(Date),
      }));
    });
  });

  describe('ingestChunks', () => {
    it('should embed chunks and insert into pgvector', async () => {
      await ingestChunks(mockChunks, {
        lectureId: mockLectureId,
        courseId: mockCourseId,
        apiKey: 'test-api-key',
      });

      // Should call embedBatch with chunk texts
      expect(mockEmbedBatch).toHaveBeenCalledWith(
        [mockChunks[0].text, mockChunks[1].text],
        'test-api-key'
      );

      // Should execute SQL insert
      expect(mockDbExecute).toHaveBeenCalled();
    });

    it('should handle empty chunks array', async () => {
      await ingestChunks([], {
        lectureId: mockLectureId,
        courseId: mockCourseId,
        apiKey: 'test-api-key',
      });

      // Should not call embedBatch for empty array
      expect(mockEmbedBatch).not.toHaveBeenCalled();
      expect(mockDbExecute).not.toHaveBeenCalled();
    });
  });

  describe('processLecture', () => {
    it('should process lecture through full pipeline', async () => {
      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Should transcribe audio
      expect(mockTranscribeAudio).toHaveBeenCalled();

      // Should chunk transcript
      expect(mockChunkTranscript).toHaveBeenCalled();

      // Should embed and ingest chunks
      expect(mockEmbedBatch).toHaveBeenCalled();
      expect(mockDbExecute).toHaveBeenCalled();
    });

    it('should update status throughout pipeline stages', async () => {
      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Check that status was updated multiple times
      const setCalls = setMock.mock.calls;
      const statuses = setCalls
        .map((call: unknown[]) => (call[0] as { status?: string })?.status)
        .filter(Boolean);

      expect(statuses).toContain('transcribing');
      expect(statuses).toContain('chunking');
      expect(statuses).toContain('completed');
    });

    it('should handle transcription failure', async () => {
      mockTranscribeAudio.mockRejectedValue(new Error('Transcription failed'));

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Should update status to failed
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('Transcription failed'),
        })
      );
    });

    it('should handle chunking failure', async () => {
      mockChunkTranscript.mockRejectedValue(new Error('Chunking failed'));

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Should update status to failed
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
        })
      );
    });

    it('should handle empty transcript', async () => {
      mockTranscribeAudio.mockResolvedValue({
        transcription: '',
        segments: [],
        detected_language: 'en',
      });
      mockChunkTranscript.mockResolvedValue([]);

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Should complete with 0 chunks
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'completed',
          chunkCount: 0,
        })
      );
    });

    it('should cleanup temp audio after processing', async () => {
      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      expect(mockCleanupTempAudio).toHaveBeenCalledWith(mockLectureId);
    });
  });

  describe('downloadAndProcessLecture', () => {
    const mockStreamUrl = 'https://cloudfront.example.com/master.m3u8?signed';

    it('should download stream and process lecture', async () => {
      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await downloadAndProcessLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
        streamUrl: mockStreamUrl,
      });

      // Should download and extract audio
      expect(mockDownloadAndExtractAudio).toHaveBeenCalledWith(
        mockStreamUrl,
        expect.stringContaining(mockLectureId)
      );

      // Should update status to downloading first
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'downloading' })
      );

      // Should transcribe and chunk
      expect(mockTranscribeAudio).toHaveBeenCalled();
      expect(mockChunkTranscript).toHaveBeenCalled();
    });

    it('should handle download failure', async () => {
      mockDownloadAndExtractAudio.mockRejectedValue(new Error('FFmpeg failed'));

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await downloadAndProcessLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
        streamUrl: mockStreamUrl,
      });

      // Should update status to failed
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('FFmpeg failed'),
        })
      );
    });

    it('should update duration from download result', async () => {
      mockDownloadAndExtractAudio.mockResolvedValue({
        outputPath: `/tmp/test-lectures/${mockLectureId}.m4a`,
        durationSeconds: 1800, // 30 minutes
      });

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await downloadAndProcessLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
        streamUrl: mockStreamUrl,
      });

      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({ durationSeconds: 1800 })
      );
    });
  });

  describe('error handling', () => {
    it('should not throw on processLecture failure', async () => {
      mockTranscribeAudio.mockRejectedValue(new Error('Critical failure'));

      // Should not throw
      await expect(
        processLecture({
          lectureId: mockLectureId,
          userId: mockUserId,
          courseId: mockCourseId,
        })
      ).resolves.not.toThrow();
    });

    it('should not throw on downloadAndProcessLecture failure', async () => {
      mockDownloadAndExtractAudio.mockRejectedValue(new Error('Network error'));

      // Should not throw
      await expect(
        downloadAndProcessLecture({
          lectureId: mockLectureId,
          userId: mockUserId,
          courseId: mockCourseId,
          streamUrl: 'https://example.com/stream.m3u8',
        })
      ).resolves.not.toThrow();
    });

    it('should handle embedding failure', async () => {
      mockEmbedBatch.mockRejectedValue(new Error('Embedding API error'));

      const setMock = vi.fn().mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) });
      mockDbUpdate.mockReturnValue({ set: setMock });

      await processLecture({
        lectureId: mockLectureId,
        userId: mockUserId,
        courseId: mockCourseId,
      });

      // Should update status to failed
      expect(setMock).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failed',
          errorMessage: expect.stringContaining('Embedding'),
        })
      );
    });
  });
});
