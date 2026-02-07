/**
 * Lecture processing pipeline orchestration.
 *
 * This module coordinates the full lecture processing workflow:
 * 1. Transcription via Groq (whisper-large-v3-turbo, serverless)
 * 2. Transcript normalization (remove fillers, detect garbage)
 * 3. Semantic chunking (LLM-based topic detection)
 * 4. Chunk embedding and pgvector ingestion
 * 5. Status updates and cleanup
 */

import { eq, sql } from 'drizzle-orm';

import { db, lectures } from '@/lib/db';
import { formatVectorLiteral } from '@/lib/db/vector-utils';
import { embedBatch } from '@/lib/ai/embeddings';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';
import { transcribeAudio } from './groq-client';
import { normalizeTranscript } from './normalize';
import { chunkTranscript, type TimestampedChunk } from './chunking';
import { getTempAudioPath, cleanupTempAudio, ensureTempDir } from './temp-files';
import { downloadAndExtractAudio } from './ffmpeg';


/**
 * Lecture status values for the pipeline.
 */
export type LectureStatus =
  | 'pending'
  | 'downloading'
  | 'transcribing'
  | 'chunking'
  | 'completed'
  | 'failed';

/**
 * Fields that can be updated on a lecture during processing.
 */
export interface LectureStatusUpdate {
  status?: LectureStatus;
  durationSeconds?: number;
  chunkCount?: number;
  errorMessage?: string | null;
  updatedAt?: Date;
}

/**
 * Options for processing a lecture from an audio file.
 */
export interface ProcessLectureOptions {
  /** Lecture ID for status updates */
  lectureId: string;
  /** Owner user ID (for API key lookup) */
  userId: string;
  /** Associated course ID */
  courseId: string;
}

/**
 * Options for downloading and processing a lecture from a stream URL.
 */
export interface DownloadAndProcessOptions extends ProcessLectureOptions {
  /** HLS stream URL to download */
  streamUrl: string;
}

/**
 * Options for ingesting chunks into pgvector.
 */
export interface IngestChunksOptions {
  /** Lecture ID */
  lectureId: string;
  /** Course ID for metadata */
  courseId: string;
  /** API key for embeddings */
  apiKey: string;
}

/**
 * Update the status and metadata of a lecture in the database.
 *
 * @param lectureId - The lecture ID to update
 * @param update - Fields to update
 */
export async function updateLectureStatus(
  lectureId: string,
  update: LectureStatusUpdate
): Promise<void> {
  await db
    .update(lectures)
    .set({
      ...update,
      updatedAt: new Date(),
    })
    .where(eq(lectures.id, lectureId));
}

/**
 * Embed chunks and insert them into the pgvector lecture_chunks_knowledge table.
 *
 * @param chunks - Timestamped chunks ready for embedding
 * @param options - Ingestion options including IDs and API key
 */
export async function ingestChunks(
  chunks: TimestampedChunk[],
  options: IngestChunksOptions
): Promise<void> {
  if (chunks.length === 0) {
    return;
  }

  const { lectureId, courseId, apiKey } = options;

  // Extract chunk texts for embedding
  const texts = chunks.map((chunk) => chunk.text);

  // Generate embeddings in batch
  const embeddings = await embedBatch(texts, apiKey);

  // Build VALUES clause for batch insert
  const values = chunks.map((chunk, index) => {
    const metadata = {
      lecture_id: lectureId,
      course_id: courseId,
      start_seconds: chunk.start_seconds,
      end_seconds: chunk.end_seconds,
      chunk_index: chunk.chunk_index,
      title: chunk.title,
    };

    // Format and validate embedding as PostgreSQL vector literal
    const vectorLiteral = formatVectorLiteral(embeddings[index]);

    return sql`(
      ${chunk.text},
      ${JSON.stringify(metadata)}::jsonb,
      ${sql.raw(`'${vectorLiteral}'::vector`)}
    )`;
  });

  // Execute batch insert
  await db.execute(sql`
    INSERT INTO ai.lecture_chunks_knowledge (content, meta_data, embedding)
    VALUES ${sql.join(values, sql`, `)}
  `);
}

/**
 * Process a lecture that already has audio stored locally.
 *
 * This is the primary path used when the browser extension sends audio bytes.
 *
 * Pipeline steps:
 * 1. Serve audio via URL for Groq to fetch
 * 2. Transcribe via Groq whisper-large-v3-turbo (serverless, 216x real-time)
 * 3. Normalize transcript (remove fillers, detect garbage)
 * 4. Chunk transcript (semantic or time-based fallback)
 * 5. Generate embeddings and insert to pgvector
 * 6. Cleanup temp audio file
 * 7. Update lecture status to completed
 *
 * On failure, updates lecture status to 'failed' with error message.
 *
 * @param options - Processing options including lecture ID and user ID
 */
export async function processLecture(
  options: ProcessLectureOptions
): Promise<void> {
  const { lectureId, userId, courseId } = options;

  try {
    // Get user's API key (BYOK or fallback)
    const apiKey = await getUserApiKey(userId);

    // Update status to transcribing
    await updateLectureStatus(lectureId, { status: 'transcribing' });

    // Get the local audio file path
    const audioPath = getTempAudioPath(lectureId);

    // Transcribe audio via Groq (direct upload, ~17sec for 1hr lecture)
    const transcriptionResult = await transcribeAudio(audioPath);

    // Update status to chunking
    await updateLectureStatus(lectureId, { status: 'chunking' });

    // Normalize transcript (remove fillers, detect garbage)
    const normalizedSegments = normalizeTranscript(transcriptionResult.segments);

    // Chunk transcript (semantic if API key available, else time-based)
    const chunks = await chunkTranscript(normalizedSegments, apiKey);

    // Ingest chunks into pgvector
    await ingestChunks(chunks, {
      lectureId,
      courseId,
      apiKey,
    });

    // Cleanup temp audio file
    await cleanupTempAudio(lectureId);

    // Update status to completed
    await updateLectureStatus(lectureId, {
      status: 'completed',
      chunkCount: chunks.length,
    });

    console.log(
      `[LecturePipeline] Lecture ${lectureId} processed successfully. ` +
        `Chunks: ${chunks.length}`
    );
  } catch (error) {
    console.error(`[LecturePipeline] Lecture ${lectureId} processing failed:`, error);

    // Update status to failed
    await updateLectureStatus(lectureId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Download audio from a stream URL and process the lecture.
 *
 * This is the fallback path used when the browser extension sends a stream URL
 * instead of audio bytes (when audioPodcast is unavailable).
 *
 * Pipeline steps:
 * 1. Download HLS stream and extract audio via FFmpeg
 * 2. Continue with standard processLecture pipeline
 *
 * @param options - Processing options including stream URL
 */
export async function downloadAndProcessLecture(
  options: DownloadAndProcessOptions
): Promise<void> {
  const { lectureId, userId, courseId, streamUrl } = options;

  try {
    // Update status to downloading
    await updateLectureStatus(lectureId, { status: 'downloading' });

    console.log(`[LecturePipeline] Downloading from stream URL: ${streamUrl.substring(0, 100)}...`);

    // Ensure temp directory exists before ffmpeg writes to it
    await ensureTempDir();

    // Download HLS stream and extract audio
    const audioPath = getTempAudioPath(lectureId);
    const { durationSeconds } = await downloadAndExtractAudio(streamUrl, audioPath);

    // Update duration from download result
    await updateLectureStatus(lectureId, { durationSeconds });

    // Continue with standard processing pipeline
    await processLecture({ lectureId, userId, courseId });
  } catch (error) {
    console.error(`[LecturePipeline] Lecture ${lectureId} download failed:`, error);

    // Update status to failed
    await updateLectureStatus(lectureId, {
      status: 'failed',
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Delete lecture chunks from pgvector.
 *
 * Used when deleting a lecture to clean up associated knowledge.
 *
 * @param lectureId - The lecture ID whose chunks should be deleted
 */
export async function deleteLectureChunks(lectureId: string): Promise<void> {
  await db.execute(sql`
    DELETE FROM ai.lecture_chunks_knowledge
    WHERE meta_data->>'lecture_id' = ${lectureId}
  `);
}
