/**
 * Lecture deduplication utilities.
 *
 * This module provides functions for detecting duplicate lectures
 * to avoid redundant processing. Deduplication is based on the
 * unique constraint (courseId, panoptoSessionId).
 */

import { and, eq } from 'drizzle-orm';

import { db, lectures, userLectures, type Lecture } from '@/lib/db';

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

/**
 * Ensure a user-lecture association exists (idempotent).
 *
 * Creates the link if it doesn't exist, does nothing if it already exists.
 * Uses ON CONFLICT DO NOTHING to handle race conditions.
 *
 * @param userId - The user ID (from Clerk)
 * @param lectureId - The lecture UUID
 */
export async function ensureUserLectureLink(
  userId: string,
  lectureId: string
): Promise<void> {
  await db
    .insert(userLectures)
    .values({ userId, lectureId })
    .onConflictDoNothing();
}

/**
 * Result of the deduplication check.
 */
export interface DeduplicationResult {
  /** The lecture (existing or newly created) */
  lecture: Lecture;
  /** Whether this is a new lecture that needs processing */
  isNew: boolean;
}

/**
 * Options for creating a new lecture.
 */
export interface CreateLectureOptions {
  courseId: string;
  panoptoSessionId: string;
  title: string;
  panoptoUrl?: string;
  streamUrl?: string;
}

/**
 * Check for existing lecture and create if not found.
 *
 * This implements the deduplication flow:
 * 1. Check if lecture exists by courseId + panoptoSessionId
 * 2. If exists: create user-lecture link, return existing (isNew: false)
 * 3. If not exists: create lecture, create link, return new (isNew: true)
 *
 * The caller should only start processing if isNew is true.
 *
 * @param userId - The user ID (from Clerk)
 * @param options - Lecture creation options
 * @returns DeduplicationResult with lecture and isNew flag
 */
export async function checkAndCreateLecture(
  userId: string,
  options: CreateLectureOptions
): Promise<DeduplicationResult> {
  const { courseId, panoptoSessionId, title, panoptoUrl, streamUrl } = options;

  // Check for existing lecture
  const existing = await findExistingLecture(courseId, panoptoSessionId);

  if (existing) {
    // Lecture exists - just create user link
    await ensureUserLectureLink(userId, existing.id);
    return { lecture: existing, isNew: false };
  }

  // Create new lecture
  const [newLecture] = await db
    .insert(lectures)
    .values({
      courseId,
      panoptoSessionId,
      title,
      panoptoUrl,
      streamUrl,
      status: 'pending',
    })
    .returning();

  // Create user-lecture link
  await ensureUserLectureLink(userId, newLecture.id);

  return { lecture: newLecture, isNew: true };
}
