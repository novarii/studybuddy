import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';

import { db, lectures, userLectures } from '@/lib/db';
import { deleteLectureChunks } from '@/lib/lectures/pipeline';

/**
 * GET /api/lectures/[id]
 *
 * Get lecture details and status.
 *
 * Response:
 * - 200 OK: Lecture details
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User doesn't have access to this lecture
 * - 404 Not Found: Lecture doesn't exist
 */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: lectureId } = await params;

  // Check user has access to this lecture
  const userLecture = await db.query.userLectures.findFirst({
    where: and(
      eq(userLectures.userId, userId),
      eq(userLectures.lectureId, lectureId)
    ),
  });

  if (!userLecture) {
    // Check if lecture exists at all
    const lecture = await db.query.lectures.findFirst({
      where: eq(lectures.id, lectureId),
    });

    if (!lecture) {
      return Response.json({ error: 'Lecture not found' }, { status: 404 });
    }

    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  // Get full lecture details
  const lecture = await db.query.lectures.findFirst({
    where: eq(lectures.id, lectureId),
  });

  if (!lecture) {
    return Response.json({ error: 'Lecture not found' }, { status: 404 });
  }

  return Response.json({
    id: lecture.id,
    courseId: lecture.courseId,
    panoptoSessionId: lecture.panoptoSessionId,
    panoptoUrl: lecture.panoptoUrl,
    streamUrl: lecture.streamUrl,
    title: lecture.title,
    durationSeconds: lecture.durationSeconds,
    chunkCount: lecture.chunkCount,
    status: lecture.status,
    errorMessage: lecture.errorMessage,
    createdAt: lecture.createdAt?.toISOString(),
    updatedAt: lecture.updatedAt?.toISOString(),
  });
}

/**
 * DELETE /api/lectures/[id]
 *
 * Delete a lecture and its associated data.
 * Removes:
 * - User-lecture link (for this user)
 * - If no other users have access: lecture record and chunks
 *
 * Response:
 * - 200 OK: Lecture deleted
 * - 401 Unauthorized: Not authenticated
 * - 403 Forbidden: User doesn't have access to this lecture
 * - 404 Not Found: Lecture doesn't exist
 */
export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: lectureId } = await params;

  // Check user has access to this lecture
  const userLecture = await db.query.userLectures.findFirst({
    where: and(
      eq(userLectures.userId, userId),
      eq(userLectures.lectureId, lectureId)
    ),
  });

  if (!userLecture) {
    // Check if lecture exists at all
    const lecture = await db.query.lectures.findFirst({
      where: eq(lectures.id, lectureId),
    });

    if (!lecture) {
      return Response.json({ error: 'Lecture not found' }, { status: 404 });
    }

    return Response.json({ error: 'Access denied' }, { status: 403 });
  }

  // Remove user's access to this lecture
  await db
    .delete(userLectures)
    .where(
      and(
        eq(userLectures.userId, userId),
        eq(userLectures.lectureId, lectureId)
      )
    );

  // Check if any other users have access
  const otherUsers = await db.query.userLectures.findFirst({
    where: eq(userLectures.lectureId, lectureId),
  });

  // If no other users have access, delete the lecture and its chunks
  if (!otherUsers) {
    // Delete chunks from pgvector
    await deleteLectureChunks(lectureId);

    // Delete lecture record (cascade will clean up any remaining userLectures)
    await db.delete(lectures).where(eq(lectures.id, lectureId));

    return Response.json({
      message: 'Lecture deleted',
      fullyDeleted: true,
    });
  }

  return Response.json({
    message: 'Access removed',
    fullyDeleted: false,
  });
}
