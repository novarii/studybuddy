/**
 * Lecture deduplication utilities.
 *
 * This module provides functions for detecting duplicate lectures
 * to avoid redundant processing. Deduplication is based on the
 * unique constraint (courseId, panoptoSessionId).
 */

import { and, eq } from 'drizzle-orm';

import { db, lectures, type Lecture } from '@/lib/db';

/**
 * Find an existing lecture by courseId and panoptoSessionId.
 *
 * This is used for deduplication - if a lecture already exists for the
 * given course and Panopto session, we can skip processing and just
 * create a user-lecture link instead.
 *
 * @param courseId - The course UUID
 * @param panoptoSessionId - The Panopto session identifier
 * @returns The existing lecture if found, or null/undefined if not
 */
export async function findExistingLecture(
  courseId: string,
  panoptoSessionId: string
): Promise<Lecture | null | undefined> {
  return db.query.lectures.findFirst({
    where: and(
      eq(lectures.courseId, courseId),
      eq(lectures.panoptoSessionId, panoptoSessionId)
    ),
  });
}
