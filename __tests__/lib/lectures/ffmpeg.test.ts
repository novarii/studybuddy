import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EventEmitter } from 'events';

import {
  downloadAndExtractAudio,
  extractAudioFromFile,
  probeDuration,
  FFmpegError,
  _setSpawn,
  _resetSpawn,
} from '@/lib/lectures/ffmpeg';

// Mock spawn function
const mockSpawn = vi.fn();

/**
 * Creates a mock child process for testing FFmpeg/ffprobe calls.
 */
function createMockProcess(options: {
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  error?: Error;
} = {}) {
  const proc = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
  };
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  // Schedule events to fire asynchronously
  setImmediate(() => {
    if (options.stdout) {
      proc.stdout.emit('data', Buffer.from(options.stdout));
    }
    if (options.stderr) {
      proc.stderr.emit('data', Buffer.from(options.stderr));
    }
    if (options.error) {
      proc.emit('error', options.error);
    } else {
      proc.emit('close', options.exitCode ?? 0);
    }
  });

  return proc;
}

describe('FFmpeg Integration', () => {
  beforeEach(() => {
    mockSpawn.mockReset();
    _setSpawn(mockSpawn as any);
  });

  afterEach(() => {
    _resetSpawn();
  });

  describe('probeDuration', () => {
    it('should return duration in seconds', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '3661.234\n', // ~1 hour duration
        })
      );

      const duration = await probeDuration('/path/to/audio.m4a');

      expect(duration).toBe(3661);
      expect(mockSpawn).toHaveBeenCalledWith('ffprobe', [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        '/path/to/audio.m4a',
      ]);
    });

    it('should round duration to nearest integer', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '125.789\n',
        })
      );

      const duration = await probeDuration('/path/to/audio.m4a');

      expect(duration).toBe(126);
    });

    it('should return 0 on ffprobe failure', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: 'No such file or directory',
        })
      );

      const duration = await probeDuration('/nonexistent/file.m4a');

      expect(duration).toBe(0);
    });

    it('should return 0 on ffprobe error', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          error: new Error('spawn ffprobe ENOENT'),
        })
      );

      const duration = await probeDuration('/path/to/audio.m4a');

      expect(duration).toBe(0);
    });

    it('should handle empty output', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '',
        })
      );

      const duration = await probeDuration('/path/to/audio.m4a');

      expect(duration).toBe(0);
    });

    it('should handle non-numeric output', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: 'N/A\n',
        })
      );

      const duration = await probeDuration('/path/to/audio.m4a');

      expect(duration).toBe(0);
    });
  });

  describe('extractAudioFromFile', () => {
    it('should extract audio from video file', async () => {
      // FFmpeg process
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stderr: 'frame= 0 fps=0.0 q=-1.0 size= 1024kB time=00:01:00.00',
        })
      );

      // ffprobe for duration
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '3600.5\n',
        })
      );

      const result = await extractAudioFromFile(
        '/path/to/video.mp4',
        '/output/audio.m4a'
      );

      expect(result.outputPath).toBe('/output/audio.m4a');
      expect(result.durationSeconds).toBe(3601);

      // Check ffmpeg was called with correct arguments
      expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
        '-y',
        '-i', '/path/to/video.mp4',
        '-vn',
        '-acodec', 'aac',
        '-b:a', '128k',
        '/output/audio.m4a',
      ]);
    });

    it('should throw FFmpegError on non-zero exit code', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: 'Invalid input file',
        })
      );

      await expect(
        extractAudioFromFile('/invalid/video.mp4', '/output/audio.m4a')
      ).rejects.toThrow(FFmpegError);
    });

    it('should include stderr in error message', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: 'Error message from FFmpeg',
        })
      );

      const error = await extractAudioFromFile(
        '/invalid/video.mp4',
        '/output/audio.m4a'
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('Error message from FFmpeg');
      expect(error.code).toBe('FFMPEG_FAILED');
    });

    it('should throw FFmpegError when ffmpeg binary not found', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          error: new Error('spawn ffmpeg ENOENT'),
        })
      );

      const error = await extractAudioFromFile(
        '/path/to/video.mp4',
        '/output/audio.m4a'
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('FFmpeg not found');
      expect(error.code).toBe('FFMPEG_NOT_FOUND');
    });

    it('should truncate long stderr in error message', async () => {
      const longStderr = 'X'.repeat(1000);
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: longStderr,
        })
      );

      const error = await extractAudioFromFile(
        '/path/to/video.mp4',
        '/output/audio.m4a'
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      // Should truncate to last 500 characters
      expect(error.message.length).toBeLessThan(600);
    });
  });

  describe('downloadAndExtractAudio', () => {
    const hlsUrl = 'https://cloudfront.example.com/stream/master.m3u8?Policy=xxx';

    it('should download HLS stream and extract audio', async () => {
      // FFmpeg process
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stderr: 'Opening input for output 0',
        })
      );

      // ffprobe for duration
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '1800.0\n',
        })
      );

      const result = await downloadAndExtractAudio(
        hlsUrl,
        '/output/audio.m4a'
      );

      expect(result.outputPath).toBe('/output/audio.m4a');
      expect(result.durationSeconds).toBe(1800);

      // Check ffmpeg was called with HLS URL
      expect(mockSpawn).toHaveBeenCalledWith('ffmpeg', [
        '-y',
        '-i', hlsUrl,
        '-vn',
        '-acodec', 'aac',
        '-b:a', '128k',
        '/output/audio.m4a',
      ]);
    });

    it('should handle complex HLS URLs with query parameters', async () => {
      const complexUrl =
        'https://d2y36twrtb17ps.cloudfront.net/sessions/abc123/master.m3u8?Policy=eyJhbGciOiJ&Signature=xyz&Key-Pair-Id=APKA';

      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
        })
      );

      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '3600.0\n',
        })
      );

      const result = await downloadAndExtractAudio(
        complexUrl,
        '/output/audio.m4a'
      );

      expect(result.outputPath).toBe('/output/audio.m4a');

      // URL should be passed as-is
      const ffmpegCall = mockSpawn.mock.calls[0];
      expect(ffmpegCall[1]).toContain(complexUrl);
    });

    it('should throw FFmpegError on download failure', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: 'Connection refused',
        })
      );

      const error = await downloadAndExtractAudio(
        'https://invalid.url/stream.m3u8',
        '/output/audio.m4a'
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('Connection refused');
    });

    it('should throw FFmpegError when ffmpeg binary not found', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          error: new Error('spawn ffmpeg ENOENT'),
        })
      );

      const error = await downloadAndExtractAudio(
        hlsUrl,
        '/output/audio.m4a'
      ).catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('FFmpeg not found');
      expect(error.code).toBe('FFMPEG_NOT_FOUND');
    });

    it('should return 0 duration if ffprobe fails after successful extraction', async () => {
      // FFmpeg succeeds
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
        })
      );

      // ffprobe fails
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 1,
          stderr: 'Invalid data found when processing input',
        })
      );

      const result = await downloadAndExtractAudio(
        hlsUrl,
        '/output/audio.m4a'
      );

      expect(result.outputPath).toBe('/output/audio.m4a');
      expect(result.durationSeconds).toBe(0);
    });
  });

  describe('FFmpegError', () => {
    it('should be instanceof Error', () => {
      const error = new FFmpegError('test error', 'TEST_CODE');
      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(FFmpegError);
    });

    it('should have correct name', () => {
      const error = new FFmpegError('test error', 'TEST_CODE');
      expect(error.name).toBe('FFmpegError');
    });

    it('should store error code', () => {
      const error = new FFmpegError('test error', 'TEST_CODE');
      expect(error.code).toBe('TEST_CODE');
    });
  });

  describe('edge cases', () => {
    it('should handle paths with spaces', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
        })
      );

      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '100.0\n',
        })
      );

      const result = await extractAudioFromFile(
        '/path/with spaces/video file.mp4',
        '/output path/audio file.m4a'
      );

      expect(result.outputPath).toBe('/output path/audio file.m4a');

      // Verify paths are passed correctly (spawn handles quoting)
      const ffmpegCall = mockSpawn.mock.calls[0];
      expect(ffmpegCall[1]).toContain('/path/with spaces/video file.mp4');
      expect(ffmpegCall[1]).toContain('/output path/audio file.m4a');
    });

    it('should handle very short audio', async () => {
      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
        })
      );

      mockSpawn.mockReturnValueOnce(
        createMockProcess({
          exitCode: 0,
          stdout: '0.5\n',
        })
      );

      const result = await extractAudioFromFile(
        '/path/to/short.mp4',
        '/output/short.m4a'
      );

      expect(result.durationSeconds).toBe(1);
    });

    it('should handle stderr accumulating during processing', async () => {
      const proc = new EventEmitter() as EventEmitter & {
        stdout: EventEmitter;
        stderr: EventEmitter;
      };
      proc.stdout = new EventEmitter();
      proc.stderr = new EventEmitter();

      mockSpawn.mockReturnValueOnce(proc);

      const promise = extractAudioFromFile(
        '/path/to/video.mp4',
        '/output/audio.m4a'
      );

      // Simulate multiple stderr writes (progress updates)
      setImmediate(() => {
        proc.stderr.emit('data', Buffer.from('frame=1 '));
        proc.stderr.emit('data', Buffer.from('frame=2 '));
        proc.stderr.emit('data', Buffer.from('frame=3 '));
        proc.emit('close', 1);
      });

      const error = await promise.catch((e) => e);

      expect(error).toBeInstanceOf(FFmpegError);
      expect(error.message).toContain('frame=1');
      expect(error.message).toContain('frame=2');
      expect(error.message).toContain('frame=3');
    });
  });
});
