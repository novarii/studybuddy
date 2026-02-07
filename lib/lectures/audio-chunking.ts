/**
 * Audio chunking for long lecture transcription.
 *
 * Splits long audio files into overlapping chunks for Groq transcription,
 * then merges results with intelligent overlap handling.
 *
 * Based on Groq's official chunking guide:
 * @see https://github.com/groq/groq-api-cookbook/tree/main/tutorials/audio-chunking
 */

import { spawn } from 'child_process';
import { stat, unlink, readdir, mkdir } from 'fs/promises';
import { join, dirname } from 'path';
import Groq from 'groq-sdk';
import { createReadStream } from 'fs';

import { TranscriptionResult, TranscriptionError, WhisperSegment } from './types';

/**
 * Default chunk configuration.
 * 10 minute chunks — mono FLAC at 16kHz is ~15MB per 10 min, fits within Groq 25MB limit.
 * Channel detection extracts a single channel before chunking, so chunks are always mono.
 */
const DEFAULT_CHUNK_LENGTH_SECONDS = 600; // 10 minutes
const DEFAULT_OVERLAP_SECONDS = 10;

/**
 * Groq model for transcription.
 */
const GROQ_MODEL = 'whisper-large-v3-turbo';

/**
 * Information about a single audio chunk.
 */
interface ChunkInfo {
  /** Path to the chunk file */
  path: string;
  /** Start time in milliseconds */
  startMs: number;
  /** End time in milliseconds */
  endMs: number;
  /** Chunk index */
  index: number;
}

/**
 * Result from transcribing a single chunk.
 */
interface ChunkTranscriptionResult {
  /** The transcription result */
  result: {
    text: string;
    segments: Array<{
      id: number;
      start: number;
      end: number;
      text: string;
    }>;
    language?: string;
  };
  /** Start time of this chunk in milliseconds */
  startMs: number;
  /** Chunk index */
  index: number;
}

/**
 * Get the number of audio channels using ffprobe.
 */
async function getChannelCount(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'stream=channels',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    let output = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const channels = parseInt(output.trim(), 10);
        if (isNaN(channels)) {
          reject(new Error('Failed to parse channel count'));
        } else {
          resolve(channels);
        }
      } else {
        reject(new Error(`ffprobe failed: ${stderr}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe not found: ${err.message}`));
    });
  });
}

/**
 * Probe a single audio channel by extracting a 30s snippet and transcribing it.
 * Returns the average avg_logprob across all segments (higher = better).
 */
async function probeChannel(
  groq: Groq,
  audioPath: string,
  channel: 0 | 1,
  startSeconds: number = 30
): Promise<number> {
  const tmpPath = join(dirname(audioPath), `probe_ch${channel}.flac`);

  try {
    // Extract 30s snippet of specific channel as mono FLAC
    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', [
        '-y',
        '-ss', startSeconds.toString(),
        '-i', audioPath,
        '-t', '30',
        '-af', `pan=mono|c0=c${channel}`,
        '-ar', '16000',
        '-c:a', 'flac',
        tmpPath,
      ]);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg probe extraction failed: ${stderr.slice(-500)}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg not found: ${err.message}`));
      });
    });

    // Check snippet is large enough (at least ~5s of audio)
    const stats = await stat(tmpPath);
    if (stats.size < 10000) {
      console.log(`[AudioChunking] Probe ch${channel} snippet too small (${stats.size}B), skipping`);
      return -Infinity;
    }

    // Transcribe with Groq
    const transcription = await groq.audio.transcriptions.create({
      file: createReadStream(tmpPath),
      model: GROQ_MODEL,
      response_format: 'verbose_json',
      language: 'en',
      temperature: 0,
    });

    const response = transcription as unknown as {
      segments?: Array<{ avg_logprob?: number }>;
    };

    const segments = response.segments || [];
    if (segments.length === 0) return -Infinity;

    // Average avg_logprob across segments
    const logprobs = segments
      .map((s) => s.avg_logprob)
      .filter((v): v is number => v !== undefined);

    if (logprobs.length === 0) return -Infinity;

    return logprobs.reduce((sum, v) => sum + v, 0) / logprobs.length;
  } finally {
    try {
      await unlink(tmpPath);
    } catch {
      // Ignore cleanup errors
    }
  }
}

/**
 * Detect the best audio channel for transcription.
 * For mono files, returns null (no channel selection needed).
 * For stereo files, probes both channels and returns the one with better avg_logprob.
 */
async function selectBestChannel(
  groq: Groq,
  audioPath: string
): Promise<number | null> {
  const channels = await getChannelCount(audioPath);

  if (channels <= 1) {
    console.log('[AudioChunking] Mono input, skipping channel detection');
    return null;
  }

  // Probe from the middle of the audio to avoid intro silence/jingles
  const duration = await getAudioDuration(audioPath);
  const probeStart = Math.max(0, Math.floor(duration / 2) - 15);

  console.log(`[AudioChunking] Detected ${channels} channels, probing from ${probeStart}s...`);

  let leftScore: number;
  let rightScore: number;

  try {
    [leftScore, rightScore] = await Promise.all([
      probeChannel(groq, audioPath, 0, probeStart),
      probeChannel(groq, audioPath, 1, probeStart),
    ]);
  } catch (err) {
    console.warn('[AudioChunking] Channel probe failed, defaulting to left channel:', err);
    return 0;
  }

  const bestChannel = leftScore >= rightScore ? 0 : 1;

  console.log(
    `[AudioChunking] Selected channel ${bestChannel} (avg_logprob: ${leftScore.toFixed(2)} vs ${rightScore.toFixed(2)})`
  );

  return bestChannel;
}

/**
 * Get audio duration using ffprobe.
 */
async function getAudioDuration(audioPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ]);

    let output = '';
    let stderr = '';

    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });

    ffprobe.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        if (isNaN(duration)) {
          reject(new Error('Failed to parse audio duration'));
        } else {
          resolve(duration);
        }
      } else {
        reject(new Error(`ffprobe failed: ${stderr}`));
      }
    });

    ffprobe.on('error', (err) => {
      reject(new Error(`ffprobe not found: ${err.message}`));
    });
  });
}

/**
 * Split audio file into chunks using FFmpeg.
 *
 * @param audioPath - Path to the input audio file
 * @param chunkLengthSeconds - Length of each chunk in seconds
 * @param overlapSeconds - Overlap between chunks in seconds
 * @returns Array of chunk info objects
 */
async function splitAudioIntoChunks(
  audioPath: string,
  chunkLengthSeconds: number = DEFAULT_CHUNK_LENGTH_SECONDS,
  overlapSeconds: number = DEFAULT_OVERLAP_SECONDS,
  channel: number | null = null
): Promise<ChunkInfo[]> {
  // Get audio duration
  const durationSeconds = await getAudioDuration(audioPath);
  const durationMs = durationSeconds * 1000;

  console.log(`[AudioChunking] Audio duration: ${durationSeconds.toFixed(2)}s`);

  const chunkMs = chunkLengthSeconds * 1000;
  const overlapMs = overlapSeconds * 1000;
  const stepMs = chunkMs - overlapMs;

  // Calculate number of chunks
  const numChunks = Math.ceil(durationMs / stepMs);

  console.log(`[AudioChunking] Splitting into ${numChunks} chunks (${chunkLengthSeconds}s each, ${overlapSeconds}s overlap)`);

  // Create chunks directory
  const chunksDir = join(dirname(audioPath), 'chunks');
  await mkdir(chunksDir, { recursive: true });

  const chunks: ChunkInfo[] = [];

  for (let i = 0; i < numChunks; i++) {
    const startMs = i * stepMs;
    const endMs = Math.min(startMs + chunkMs, durationMs);
    const startSeconds = startMs / 1000;
    const durationChunkSeconds = (endMs - startMs) / 1000;

    const chunkPath = join(chunksDir, `chunk_${i.toString().padStart(3, '0')}.flac`);

    // Extract chunk using FFmpeg.
    // When a specific channel is selected, extract it as mono via pan filter.
    // Use FLAC (lossless) at 16kHz as recommended by Groq docs.
    const ffmpegArgs = [
      '-y',
      '-ss', startSeconds.toString(),
      '-i', audioPath,
      '-t', durationChunkSeconds.toString(),
      ...(channel !== null ? ['-af', `pan=mono|c0=c${channel}`] : []),
      '-ar', '16000',
      '-c:a', 'flac',
      chunkPath,
    ];

    await new Promise<void>((resolve, reject) => {
      const ffmpeg = spawn('ffmpeg', ffmpegArgs);

      let stderr = '';
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`FFmpeg chunk extraction failed: ${stderr.slice(-500)}`));
        }
      });

      ffmpeg.on('error', (err) => {
        reject(new Error(`FFmpeg not found: ${err.message}`));
      });
    });

    chunks.push({
      path: chunkPath,
      startMs,
      endMs,
      index: i,
    });
  }

  return chunks;
}

/**
 * Transcribe a single audio chunk with Groq.
 */
async function transcribeChunk(
  groq: Groq,
  chunk: ChunkInfo,
  totalChunks: number
): Promise<ChunkTranscriptionResult> {
  const stats = await stat(chunk.path);
  console.log(`[AudioChunking] Transcribing chunk ${chunk.index + 1}/${totalChunks} (${(stats.size / 1024).toFixed(1)}KB)`);

  const startTime = Date.now();

  const transcription = await groq.audio.transcriptions.create({
    file: createReadStream(chunk.path),
    model: GROQ_MODEL,
    response_format: 'verbose_json',
    language: 'en',
    temperature: 0,
  });

  const apiTime = Date.now() - startTime;
  console.log(`[AudioChunking] Chunk ${chunk.index + 1} done in ${apiTime}ms`);

  // Cast to get segments
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

  return {
    result: {
      text: response.text,
      segments: response.segments || [],
      language: response.language,
    },
    startMs: chunk.startMs,
    index: chunk.index,
  };
}

/**
 * Find longest common sequence between two text sequences.
 * Used for merging overlapping chunk boundaries.
 *
 * Based on Groq's official algorithm.
 */
function findLongestCommonSequence(sequences: string[]): string {
  if (sequences.length === 0) return '';
  if (sequences.length === 1) return sequences[0];

  // Split into words
  const wordSequences = sequences.map((seq) =>
    seq.split(/\s+/).filter((w) => w.length > 0)
  );

  let leftSequence = wordSequences[0];
  let leftLength = leftSequence.length;
  const totalSequence: string[] = [];

  for (let seqIdx = 1; seqIdx < wordSequences.length; seqIdx++) {
    const rightSequence = wordSequences[seqIdx];
    const rightLength = rightSequence.length;

    let maxMatching = 0;
    let maxIndices = [leftLength, leftLength, 0, 0];

    // Try different alignments
    for (let i = 1; i <= leftLength + rightLength; i++) {
      const eps = i / 10000;

      const leftStart = Math.max(0, leftLength - i);
      const leftStop = Math.min(leftLength, leftLength + rightLength - i);
      const left = leftSequence.slice(leftStart, leftStop);

      const rightStart = Math.max(0, i - leftLength);
      const rightStop = Math.min(rightLength, i);
      const right = rightSequence.slice(rightStart, rightStop);

      if (left.length !== right.length) continue;

      // Count matches
      let matches = 0;
      for (let j = 0; j < left.length; j++) {
        if (left[j].toLowerCase() === right[j].toLowerCase()) {
          matches++;
        }
      }

      const matching = matches / i + eps;

      // Require at least 2 matches
      if (matches > 1 && matching > maxMatching) {
        maxMatching = matching;
        maxIndices = [leftStart, leftStop, rightStart, rightStop];
      }
    }

    const [leftStart, leftStop, rightStart, rightStop] = maxIndices;

    // Take left half from left sequence, right half from right sequence
    const leftMid = Math.floor((leftStop + leftStart) / 2);
    const rightMid = Math.floor((rightStop + rightStart) / 2);

    totalSequence.push(...leftSequence.slice(0, leftMid));
    leftSequence = rightSequence.slice(rightMid);
    leftLength = leftSequence.length;
  }

  // Add remaining
  totalSequence.push(...leftSequence);

  return totalSequence.join(' ');
}

/**
 * Merge chunk transcription results into a single transcript.
 * Handles overlapping regions using longest common sequence matching.
 */
function mergeTranscripts(
  results: ChunkTranscriptionResult[],
  overlapMs: number
): TranscriptionResult {
  console.log('[AudioChunking] Merging transcripts...');

  if (results.length === 0) {
    return {
      transcription: '',
      segments: [],
      detected_language: 'en',
    };
  }

  if (results.length === 1) {
    const r = results[0];
    return {
      transcription: r.result.text,
      segments: r.result.segments.map((s) => ({
        id: s.id,
        start: s.start + r.startMs / 1000,
        end: s.end + r.startMs / 1000,
        text: s.text.trim(),
      })),
      detected_language: r.result.language || 'en',
    };
  }

  // Sort by index
  results.sort((a, b) => a.index - b.index);

  const mergedSegments: WhisperSegment[] = [];
  let segmentId = 0;

  for (let i = 0; i < results.length; i++) {
    const chunk = results[i];
    const isLast = i === results.length - 1;
    const nextChunk = isLast ? null : results[i + 1];

    // Adjust segment timestamps to absolute time
    const adjustedSegments = chunk.result.segments.map((s) => ({
      ...s,
      start: s.start + chunk.startMs / 1000,
      end: s.end + chunk.startMs / 1000,
    }));

    if (isLast) {
      // Add all segments from last chunk
      for (const seg of adjustedSegments) {
        mergedSegments.push({
          id: segmentId++,
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        });
      }
    } else {
      // Find overlap boundary
      const overlapStartTime = (nextChunk!.startMs) / 1000;

      // Split segments into current and overlap
      const currentSegments = adjustedSegments.filter((s) => s.end <= overlapStartTime);
      const overlapSegments = adjustedSegments.filter((s) => s.end > overlapStartTime);

      // Add non-overlapping segments
      for (const seg of currentSegments) {
        mergedSegments.push({
          id: segmentId++,
          start: seg.start,
          end: seg.end,
          text: seg.text.trim(),
        });
      }

      // For overlap, merge with next chunk's beginning using LCS
      if (overlapSegments.length > 0 && nextChunk) {
        const nextAdjustedSegments = nextChunk.result.segments.map((s) => ({
          ...s,
          start: s.start + nextChunk.startMs / 1000,
          end: s.end + nextChunk.startMs / 1000,
        }));

        const overlapEndTime = overlapStartTime + overlapMs / 1000;
        const nextOverlapSegments = nextAdjustedSegments.filter(
          (s) => s.start < overlapEndTime
        );

        if (nextOverlapSegments.length > 0) {
          // Merge overlap texts using LCS
          const overlapText = overlapSegments.map((s) => s.text).join(' ');
          const nextOverlapText = nextOverlapSegments.map((s) => s.text).join(' ');

          const mergedText = findLongestCommonSequence([overlapText, nextOverlapText]);

          // Create merged segment
          mergedSegments.push({
            id: segmentId++,
            start: overlapSegments[0].start,
            end: nextOverlapSegments[nextOverlapSegments.length - 1].end,
            text: mergedText.trim(),
          });
        } else {
          // No overlap in next chunk, just add current overlap segments
          for (const seg of overlapSegments) {
            mergedSegments.push({
              id: segmentId++,
              start: seg.start,
              end: seg.end,
              text: seg.text.trim(),
            });
          }
        }
      }
    }
  }

  // Build full text from segments
  const fullText = mergedSegments.map((s) => s.text).join(' ');

  return {
    transcription: fullText,
    segments: mergedSegments,
    detected_language: results[0].result.language || 'en',
  };
}

/**
 * Clean up chunk files after processing.
 */
async function cleanupChunks(chunks: ChunkInfo[]): Promise<void> {
  for (const chunk of chunks) {
    try {
      await unlink(chunk.path);
    } catch {
      // Ignore cleanup errors
    }
  }

  // Try to remove chunks directory
  if (chunks.length > 0) {
    const chunksDir = dirname(chunks[0].path);
    try {
      const remaining = await readdir(chunksDir);
      if (remaining.length === 0) {
        await unlink(chunksDir);
      }
    } catch {
      // Ignore
    }
  }
}

/**
 * Transcribe a long audio file using chunking.
 *
 * Splits the audio into overlapping chunks, transcribes each with Groq,
 * then merges the results with intelligent overlap handling.
 *
 * @param audioPath - Path to the audio file
 * @param options - Chunking options
 * @returns Merged transcription result
 */
export async function transcribeWithChunking(
  audioPath: string,
  options: {
    chunkLengthSeconds?: number;
    overlapSeconds?: number;
  } = {}
): Promise<TranscriptionResult> {
  const chunkLengthSeconds = options.chunkLengthSeconds ?? DEFAULT_CHUNK_LENGTH_SECONDS;
  const overlapSeconds = options.overlapSeconds ?? DEFAULT_OVERLAP_SECONDS;

  // Get API key
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new TranscriptionError(
      'GROQ_API_KEY environment variable is not set',
      'MISSING_API_KEY'
    );
  }

  const groq = new Groq({
    apiKey,
    timeout: 2 * 60 * 1000, // 2 minute timeout per chunk
  });

  // Check file exists and get size
  const stats = await stat(audioPath);
  console.log(`[AudioChunking] Input file: ${audioPath} (${(stats.size / 1024 / 1024).toFixed(2)}MB)`);

  let chunks: ChunkInfo[] = [];

  try {
    // Detect best channel for stereo files (probes both channels, picks best)
    const bestChannel = await selectBestChannel(groq, audioPath);

    // Split into chunks (with channel extraction if stereo)
    chunks = await splitAudioIntoChunks(audioPath, chunkLengthSeconds, overlapSeconds, bestChannel);

    // Transcribe all chunks
    const results: ChunkTranscriptionResult[] = [];
    for (const chunk of chunks) {
      const result = await transcribeChunk(groq, chunk, chunks.length);
      results.push(result);
    }

    // Merge results
    const merged = mergeTranscripts(results, overlapSeconds * 1000);

    console.log(`[AudioChunking] Transcription complete: ${merged.segments.length} segments`);

    return merged;
  } finally {
    // Cleanup chunk files
    await cleanupChunks(chunks);
  }
}
