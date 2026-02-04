import { auth } from '@clerk/nextjs/server';

import { checkAndCreateLecture } from '@/lib/lectures/deduplication';
import { downloadAndProcessLecture } from '@/lib/lectures/pipeline';
import { extractPanoptoSessionId } from '@/lib/lectures/utils';

/**
 * Request body for stream URL upload.
 */
interface StreamUploadRequest {
  streamUrl: string;
  courseId: string;
  title: string;
  panoptoUrl?: string;
}

/**
 * POST /api/lectures/stream
 *
 * Process a lecture from an HLS stream URL.
 * This is the fallback path when the browser extension cannot send audio bytes.
 *
 * Request: JSON body with:
 * - streamUrl: HLS stream URL (m3u8)
 * - courseId: Course UUID
 * - title: Lecture title
 * - panoptoUrl (optional): Panopto viewer URL (used to extract session ID if not in streamUrl)
 *
 * Response:
 * - 202 Accepted: Lecture created/found, processing started if new
 * - 400 Bad Request: Missing required fields or invalid URL
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

  const { streamUrl, courseId, title, panoptoUrl } = body;

  // Validate required fields
  if (!streamUrl) {
    return Response.json({ error: 'streamUrl is required' }, { status: 400 });
  }

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  // Extract panopto session ID from URL
  // Prefer panoptoUrl if provided, otherwise try streamUrl
  let panoptoSessionId: string;
  try {
    panoptoSessionId = extractPanoptoSessionId(panoptoUrl || streamUrl);
  } catch (error) {
    return Response.json(
      {
        error: 'Unable to extract session ID from URL',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 400 }
    );
  }

  // Check for existing lecture and create if not found
  const { lecture, isNew } = await checkAndCreateLecture(userId, {
    courseId,
    panoptoSessionId,
    title,
    panoptoUrl,
    streamUrl,
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
