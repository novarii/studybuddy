import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { Readable } from 'stream';

import { auth } from '@clerk/nextjs/server';
import { and, eq } from 'drizzle-orm';

import { db, userLectures } from '@/lib/db';
import { getTempAudioPath, tempAudioExists } from '@/lib/lectures/temp-files';

/**
 * UUID v4 validation regex.
 * Matches standard UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * GET /api/lectures/audio/[lectureId]
 *
 * Serves temporary audio files during lecture processing.
 *
 * Security:
 * - Requires Clerk authentication
 * - Validates lectureId is a valid UUID (prevents path traversal)
 * - Verifies user has access to the lecture via userLectures table
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ lectureId: string }> }
) {
  // Authenticate user
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { lectureId } = await params;

  // Validate lectureId is a valid UUID (prevents path traversal)
  if (!UUID_REGEX.test(lectureId)) {
    return Response.json({ error: 'Invalid lecture ID format' }, { status: 400 });
  }

  // Verify user has access to this lecture
  const userLecture = await db.query.userLectures.findFirst({
    where: and(
      eq(userLectures.userId, userId),
      eq(userLectures.lectureId, lectureId)
    ),
  });

  if (!userLecture) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

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
