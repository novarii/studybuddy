/**
 * API Route: Add/Remove Course from User
 *
 * POST /api/user/courses/:courseId - Enroll user in a course
 * DELETE /api/user/courses/:courseId - Unenroll user from a course
 * Requires authentication.
 */

import { auth } from '@clerk/nextjs/server';
import { db, courses, userCourses } from '@/lib/db';
import { eq, and } from 'drizzle-orm';

interface RouteParams {
  params: Promise<{ courseId: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await params;

  // Check if course exists
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });

  if (!course) {
    return Response.json({ error: 'Course not found' }, { status: 404 });
  }

  // Check if user already enrolled
  const existing = await db.query.userCourses.findFirst({
    where: and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId)),
  });

  if (existing) {
    return Response.json({ error: 'Course already added' }, { status: 409 });
  }

  // Enroll user in course
  await db.insert(userCourses).values({
    userId,
    courseId,
  });

  return Response.json({ message: 'Course added' });
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { courseId } = await params;

  // Delete enrollment (idempotent - doesn't matter if it didn't exist)
  await db.delete(userCourses).where(
    and(eq(userCourses.userId, userId), eq(userCourses.courseId, courseId))
  );

  return new Response(null, { status: 204 });
}
