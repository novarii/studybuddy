import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';

import { db, lectures, userLectures } from '@/lib/db';

/**
 * GET /api/lectures
 *
 * List lectures for a course that the user has access to.
 *
 * Query params:
 * - courseId (required): Filter by course
 *
 * Response:
 * - 200 OK: List of lectures
 * - 400 Bad Request: Missing courseId
 * - 401 Unauthorized: Not authenticated
 */
export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  // Get lectures for this course that the user has access to
  // Join with userLectures to filter by user ownership
  const userLectureList = await db
    .select({
      id: lectures.id,
      courseId: lectures.courseId,
      panoptoSessionId: lectures.panoptoSessionId,
      panoptoUrl: lectures.panoptoUrl,
      title: lectures.title,
      durationSeconds: lectures.durationSeconds,
      chunkCount: lectures.chunkCount,
      status: lectures.status,
      errorMessage: lectures.errorMessage,
      createdAt: lectures.createdAt,
      updatedAt: lectures.updatedAt,
    })
    .from(lectures)
    .innerJoin(userLectures, eq(lectures.id, userLectures.lectureId))
    .where(
      and(
        eq(userLectures.userId, userId),
        eq(lectures.courseId, courseId)
      )
    )
    .orderBy(desc(lectures.createdAt));

  return Response.json({
    lectures: userLectureList.map((lecture) => ({
      id: lecture.id,
      courseId: lecture.courseId,
      panoptoSessionId: lecture.panoptoSessionId,
      panoptoUrl: lecture.panoptoUrl,
      title: lecture.title,
      durationSeconds: lecture.durationSeconds,
      chunkCount: lecture.chunkCount,
      status: lecture.status,
      errorMessage: lecture.errorMessage,
      createdAt: lecture.createdAt?.toISOString(),
      updatedAt: lecture.updatedAt?.toISOString(),
    })),
  });
}
