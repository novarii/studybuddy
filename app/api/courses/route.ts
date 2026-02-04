/**
 * API Route: List All Courses
 *
 * GET /api/courses - Returns all courses (official and user-created)
 * Requires authentication.
 */

import { auth } from '@clerk/nextjs/server';
import { db, courses } from '@/lib/db';
import { asc } from 'drizzle-orm';

export async function GET() {
  const { userId } = await auth();

  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const allCourses = await db.select().from(courses).orderBy(asc(courses.code));

  return Response.json({
    courses: allCourses.map((course) => ({
      id: course.id,
      code: course.code,
      title: course.title,
      instructor: course.instructor,
      isOfficial: course.isOfficial,
    })),
  });
}
