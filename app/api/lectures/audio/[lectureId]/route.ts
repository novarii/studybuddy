import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';

import { getTempAudioPath, tempAudioExists } from '@/lib/lectures/temp-files';

/**
 * GET /api/lectures/audio/[lectureId]
 *
 * Serves temporary audio files for Groq transcription API.
 * This endpoint is used internally - Groq fetches the audio via URL
 * for serverless transcription.
 *
 * No auth required - files are temporary and deleted after processing.
 * The lectureId acts as a secret token (UUIDs are unguessable).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  const { lectureId } = await params;

  // Check if file exists
  const exists = await tempAudioExists(lectureId);
  if (!exists) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = getTempAudioPath(lectureId);

  // Get file size for Content-Length header
  const stats = await stat(filePath);

  // Create readable stream
  const nodeStream = createReadStream(filePath);

  // Convert Node.js stream to Web ReadableStream
  const webStream = Readable.toWeb(nodeStream) as ReadableStream;

  return new Response(webStream, {
    headers: {
      'Content-Type': 'audio/mpeg',
      'Content-Length': stats.size.toString(),
      'Cache-Control': 'no-store',
    },
  });
}
