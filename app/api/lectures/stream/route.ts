import { auth } from '@clerk/nextjs/server';

import { checkAndCreateLecture } from '@/lib/lectures/deduplication';
import { downloadAndProcessLecture } from '@/lib/lectures/pipeline';

/**
 * Request body for stream URL upload.
 */
interface StreamUploadRequest {
  streamUrl: string;
  sessionId: string;
  courseId: string;
  title: string;
  sourceUrl: string;
  duration?: number;
}

/**
 * POST /api/lectures/stream
 *
 * Process a lecture from an HLS stream URL.
 *
 * Request: JSON body with:
 * - streamUrl: HLS stream URL (m3u8) for FFmpeg download
 * - sessionId: Panopto session ID for deduplication
 * - courseId: Course UUID
 * - title: Lecture title
 * - sourceUrl: Panopto viewer URL for citations
 * - duration (optional): Lecture duration in seconds
 *
 * Response:
 * - 202 Accepted: Lecture created/found, processing started if new
 * - 400 Bad Request: Missing required fields
 * - 401 Unauthorized: Not authenticated
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse JSON body
  let body: StreamUploadRequest;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { streamUrl, sessionId, courseId, title, sourceUrl, duration } = body;

  // Validate required fields
  if (!streamUrl) {
    return Response.json({ error: 'streamUrl is required' }, { status: 400 });
  }

  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  if (!sourceUrl) {
    return Response.json({ error: 'sourceUrl is required' }, { status: 400 });
  }

  // Check for existing lecture and create if not found
  const { lecture, isNew } = await checkAndCreateLecture(userId, {
    courseId,
    panoptoSessionId: sessionId,
    title,
    panoptoUrl: sourceUrl,
    streamUrl,
    durationSeconds: duration,
  });

  // Only process if this is a new lecture
  if (isNew) {
    // Start async download and processing (fire and forget)
    downloadAndProcessLecture({
      lectureId: lecture.id,
      userId,
      courseId,
      streamUrl,
    }).catch((err) => {
      console.error(`[LectureStreamUpload] Async processing failed for ${lecture.id}:`, err);
    });
  }

  // Return 202 Accepted with lecture info
  return Response.json(
    {
      id: lecture.id,
      title: lecture.title,
      status: lecture.status,
      created: isNew,
      createdAt: lecture.createdAt?.toISOString(),
    },
    { status: 202 }
  );
}
