import { auth } from '@clerk/nextjs/server';

import { checkAndCreateLecture } from '@/lib/lectures/deduplication';
import { saveTempAudio } from '@/lib/lectures/temp-files';
import { processLecture } from '@/lib/lectures/pipeline';

/**
 * Maximum file size for audio uploads (100 MB).
 */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * POST /api/lectures/audio
 *
 * Upload lecture audio for transcription and processing.
 *
 * Request: multipart/form-data with:
 * - file: Audio file (m4a, mp3, wav, etc.)
 * - courseId: Course UUID
 * - panoptoSessionId: Panopto session identifier
 * - title: Lecture title
 * - panoptoUrl (optional): Panopto viewer URL
 *
 * Response:
 * - 202 Accepted: Lecture created/found, processing started if new
 * - 400 Bad Request: Missing required fields
 * - 401 Unauthorized: Not authenticated
 * - 413 Payload Too Large: File exceeds size limit
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Parse multipart form data
  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('courseId') as string | null;
  const panoptoSessionId = formData.get('panoptoSessionId') as string | null;
  const title = formData.get('title') as string | null;
  const panoptoUrl = formData.get('panoptoUrl') as string | null;

  // Validate required fields
  if (!file) {
    return Response.json({ error: 'file is required' }, { status: 400 });
  }

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  if (!panoptoSessionId) {
    return Response.json({ error: 'panoptoSessionId is required' }, { status: 400 });
  }

  if (!title) {
    return Response.json({ error: 'title is required' }, { status: 400 });
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return Response.json(
      { error: `File size exceeds maximum of ${MAX_FILE_SIZE / 1024 / 1024}MB` },
      { status: 413 }
    );
  }

  // Check for existing lecture and create if not found
  const { lecture, isNew } = await checkAndCreateLecture(userId, {
    courseId,
    panoptoSessionId,
    title,
    panoptoUrl: panoptoUrl || undefined,
  });

  // Only process if this is a new lecture
  if (isNew) {
    // Read file bytes
    const arrayBuffer = await file.arrayBuffer();
    const audioBytes = new Uint8Array(arrayBuffer);

    // Store temp audio
    await saveTempAudio(lecture.id, audioBytes);

    // Start async processing (fire and forget)
    processLecture({
      lectureId: lecture.id,
      userId,
      courseId,
    }).catch((err) => {
      console.error(`[LectureAudioUpload] Async processing failed for ${lecture.id}:`, err);
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
