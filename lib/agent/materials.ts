import { eq, and, asc, desc, inArray } from 'drizzle-orm';

import { searchKnowledge, formatTimestamp } from '@/lib/ai';
import { getUserApiKey } from '@/lib/api-keys';
import {
  db,
  courses,
  userCourses,
  lectures,
  userLectures,
  documents,
} from '@/lib/db';

/**
 * Course-material queries shared by the Agent REST API (/api/agent/*) and the
 * MCP server (/api/mcp). Every function is scoped to a single userId.
 */

export interface AgentCourse {
  id: string;
  code: string;
  title: string;
  instructor: string | null;
}

export interface AgentLecture {
  id: string;
  title: string | null;
  durationSeconds: number | null;
  status: string;
  createdAt: string | undefined;
}

export interface AgentDocument {
  id: string;
  filename: string;
  pageCount: number | null;
  status: string;
  createdAt: string;
}

export interface AgentSearchResult {
  content: string;
  source: string;
  type: 'lecture' | 'slide';
  link?: string;
}

export async function listEnrolledCourses(
  userId: string
): Promise<AgentCourse[]> {
  const enrolled = await db
    .select()
    .from(userCourses)
    .innerJoin(courses, eq(userCourses.courseId, courses.id))
    .where(eq(userCourses.userId, userId))
    .orderBy(asc(courses.code));

  return enrolled.map(({ courses: course }) => ({
    id: course.id,
    code: course.code,
    title: course.title,
    instructor: course.instructor,
  }));
}

export async function listCourseLectures(
  userId: string,
  courseId: string
): Promise<AgentLecture[]> {
  const results = await db
    .select({
      id: lectures.id,
      title: lectures.title,
      durationSeconds: lectures.durationSeconds,
      status: lectures.status,
      createdAt: lectures.createdAt,
    })
    .from(lectures)
    .innerJoin(userLectures, eq(lectures.id, userLectures.lectureId))
    .where(
      and(eq(userLectures.userId, userId), eq(lectures.courseId, courseId))
    )
    .orderBy(desc(lectures.createdAt));

  return results.map((l) => ({
    id: l.id,
    title: l.title,
    durationSeconds: l.durationSeconds,
    status: l.status,
    createdAt: l.createdAt?.toISOString(),
  }));
}

export async function listCourseDocuments(
  userId: string,
  courseId: string
): Promise<AgentDocument[]> {
  const docs = await db.query.documents.findMany({
    where: and(eq(documents.userId, userId), eq(documents.courseId, courseId)),
    orderBy: [desc(documents.createdAt)],
  });

  return docs.map((doc) => ({
    id: doc.id,
    filename: doc.filename,
    pageCount: doc.pageCount,
    status: doc.status,
    createdAt: doc.createdAt.toISOString(),
  }));
}

export async function isEnrolled(
  userId: string,
  courseId: string
): Promise<boolean> {
  const enrollment = await db.query.userCourses.findFirst({
    where: and(
      eq(userCourses.userId, userId),
      eq(userCourses.courseId, courseId)
    ),
  });
  return !!enrollment;
}

/**
 * Vector search over a course's lectures and slides.
 *
 * Callers must check enrollment first (see isEnrolled). Returns lean results
 * with full chunk text, a source label, and a timestamped Panopto link for
 * lecture chunks.
 */
export async function searchCourseMaterials(params: {
  userId: string;
  courseId: string;
  query: string;
  lectureId?: string;
  documentId?: string;
}): Promise<AgentSearchResult[]> {
  const { userId, courseId, query, lectureId, documentId } = params;

  // Get embedding API key (user's BYOK or system fallback)
  const apiKey = await getUserApiKey(userId);

  const { rawResults } = await searchKnowledge({
    query,
    userId,
    courseId,
    documentId,
    lectureId,
    apiKey,
  });

  if (!rawResults || rawResults.length === 0) return [];

  // Batch-fetch Panopto URLs for lecture results
  const lectureIds = [
    ...new Set(
      rawResults
        .filter((r) => r.type === 'lecture')
        .map((r) => (r as Extract<typeof r, { type: 'lecture' }>).lectureId)
    ),
  ];

  const lectureMap = new Map<string, string>();
  if (lectureIds.length > 0) {
    const lectureRecords = await db
      .select({ id: lectures.id, panoptoUrl: lectures.panoptoUrl })
      .from(lectures)
      .where(inArray(lectures.id, lectureIds));

    for (const lec of lectureRecords) {
      if (lec.panoptoUrl) {
        lectureMap.set(lec.id, lec.panoptoUrl);
      }
    }
  }

  return rawResults.map((result) => {
    if (result.type === 'lecture') {
      const timestamp = formatTimestamp(result.startSeconds);
      const panoptoUrl = lectureMap.get(result.lectureId);

      // Construct timestamped Panopto link
      let link: string | undefined;
      if (panoptoUrl) {
        const url = new URL(panoptoUrl);
        url.searchParams.set('start', String(Math.floor(result.startSeconds)));
        link = url.toString();
      }

      return {
        content: result.content,
        source: `${result.title ?? 'Lecture'} @ ${timestamp}`,
        type: 'lecture' as const,
        ...(link && { link }),
      };
    }

    // Slide source
    return {
      content: result.content,
      source: `${result.title ?? 'Document'} - Slide ${result.slideNumber}`,
      type: 'slide' as const,
    };
  });
}
