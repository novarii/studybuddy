/**
 * API Route: User's Enrolled Courses
 *
 * GET /api/user/courses - Returns courses the user has enrolled in
 * Requires authentication.
 */

import { auth } from '@clerk/nextjs/server';
import { db, courses, userCourses } from '@/lib/db';
import { eq, asc } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Join userCourses with courses to get full course details
  const enrolledCourses = await db
    .select()
    .from(userCourses)
    .innerJoin(courses, eq(userCourses.courseId, courses.id))
    .where(eq(userCourses.userId, userId))
    .orderBy(asc(courses.code));

  return Response.json({
    courses: enrolledCourses.map(({ courses: course }) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      instructor: course.instructor,
      isOfficial: course.isOfficial,
    })),
  });
}
