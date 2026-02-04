/**
 * Course Sync Service
 *
 * Fetches courses from CDCS (Course Description & Class Schedule) XML endpoint
 * and syncs them to the database.
 */

import { db, courses } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';
import {
  CdcsCourse,
  SyncResult,
  SyncCoursesOptions,
  CDCS_BASE_URL,
  DEFAULT_TERMS,
  REQUEST_TIMEOUT_MS,
  DELETION_SAFETY_THRESHOLD,
} from './types';

/**
 * Strip section/program suffix from course code.
 *
 * Examples:
 * - "ACC 201-1" -> "ACC 201"
 * - "CSC 160-01" -> "CSC 160"
 * - "ACC 401-FA.MB" -> "ACC 401"
 * - "ACC 501-SP.PH" -> "ACC 501"
 */
export function stripSectionSuffix(rawCode: string): string {
  return rawCode.replace(/-[A-Za-z0-9.]+$/, '');
}

/**
 * Parse XML response from CDCS into course objects.
 *
 * @param xmlString - Raw XML string from CDCS
 * @returns Array of parsed courses with section suffixes stripped
 */
export function parseXmlCourses(xmlString: string): CdcsCourse[] {
  // Use DOMParser for XML parsing (available in Node.js via jsdom in tests)
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlString, 'text/xml');

  // Check for parse errors
  const parseError = doc.querySelector('parsererror');
  if (parseError) {
    throw new Error(`XML parse error: ${parseError.textContent}`);
  }

  const courseElements = doc.querySelectorAll('course');
  const courses: CdcsCourse[] = [];

  for (const courseEl of courseElements) {
    const cnEl = courseEl.querySelector('cn');
    const titleEl = courseEl.querySelector('title');
    const instructorsEl = courseEl.querySelector('instructors');

    // Skip courses with missing required fields
    if (!cnEl?.textContent?.trim() || !titleEl?.textContent?.trim()) {
      continue;
    }

    const rawCode = cnEl.textContent.trim();
    const code = stripSectionSuffix(rawCode);
    const title = titleEl.textContent.trim();
    const instructor = instructorsEl?.textContent?.trim() || null;

    courses.push({ code, title, instructor });
  }

  return courses;
}

/**
 * Merge instructors into a Set, handling semicolon-separated names.
 *
 * @param instructors - Set to merge into
 * @param instructorString - Semicolon-separated instructor names (may be null)
 */
export function mergeInstructors(
  instructors: Set<string>,
  instructorString: string | null
): void {
  if (!instructorString) {
    return;
  }

  for (const name of instructorString.split(';')) {
    const trimmed = name.trim();
    if (trimmed) {
      instructors.add(trimmed);
    }
  }
}

/**
 * Fetch courses from CDCS XML endpoint for a given term.
 *
 * @param term - Term string like "Fall 2025" or "Spring 2025"
 * @param courseType - Course type filter (default: "Lecture")
 * @returns Array of parsed courses
 */
export async function fetchCoursesFromCdcs(
  term: string,
  courseType: string = 'Lecture'
): Promise<CdcsCourse[]> {
  const url = `${CDCS_BASE_URL}?id=XML&term=${encodeURIComponent(term)}&type=${courseType}`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`CDCS fetch failed: ${response.status} ${response.statusText}`);
    }

    const xmlString = await response.text();
    return parseXmlCourses(xmlString);
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch courses from CDCS for given terms and sync to database.
 *
 * @param options - Sync options (terms, courseType, dryRun)
 * @returns SyncResult with counts of created, updated, unchanged, deleted courses
 */
export async function syncCourses(
  options: SyncCoursesOptions = {}
): Promise<SyncResult> {
  const { terms = DEFAULT_TERMS, courseType = 'Lecture', dryRun = false } = options;

  // Fetch and deduplicate courses across all terms
  // Store title and set of instructors for each course code
  const allCourses: Map<string, { title: string; instructors: Set<string> }> =
    new Map();

  for (const term of terms) {
    const fetched = await fetchCoursesFromCdcs(term, courseType);

    for (const course of fetched) {
      const existing = allCourses.get(course.code);

      if (existing) {
        // Merge instructors
        mergeInstructors(existing.instructors, course.instructor);
      } else {
        const instructors = new Set<string>();
        mergeInstructors(instructors, course.instructor);
        allCourses.set(course.code, {
          title: course.title,
          instructors,
        });
      }
    }
  }

  // Fetch existing courses from database
  const existingCourses = await db.select().from(courses);
  const existingByCode = new Map(existingCourses.map((c) => [c.code, c]));
  const existingOfficialCodes = new Set(
    existingCourses.filter((c) => c.isOfficial).map((c) => c.code)
  );

  let created = 0;
  let updated = 0;
  let unchanged = 0;
  let deleted = 0;
  let deletionSkipped = false;

  // Prepare upsert data
  const coursesToUpsert: Array<{
    code: string;
    title: string;
    instructor: string | null;
    isOfficial: boolean;
  }> = [];

  for (const [code, data] of allCourses) {
    const instructor =
      data.instructors.size > 0
        ? Array.from(data.instructors).sort().join('; ')
        : null;

    const existing = existingByCode.get(code);

    if (existing) {
      // Check if update needed
      const needsUpdate =
        existing.title !== data.title ||
        existing.instructor !== instructor ||
        !existing.isOfficial;

      if (needsUpdate) {
        updated++;
      } else {
        unchanged++;
      }
    } else {
      created++;
    }

    coursesToUpsert.push({
      code,
      title: data.title,
      instructor,
      isOfficial: true,
    });
  }

  // Delete stale official courses (with safety check)
  const scrapedCodes = new Set(allCourses.keys());
  const staleCodes = Array.from(existingOfficialCodes).filter(
    (code) => !scrapedCodes.has(code)
  );

  if (staleCodes.length > 0) {
    // Safety check: only delete if scraped count is reasonably close to existing
    const meetsThreshold =
      existingOfficialCodes.size === 0 ||
      scrapedCodes.size >= existingOfficialCodes.size * DELETION_SAFETY_THRESHOLD;

    if (meetsThreshold) {
      deleted = staleCodes.length;
    } else {
      deletionSkipped = true;
    }
  }

  // Apply changes to database (unless dry run)
  if (!dryRun) {
    // Upsert courses
    if (coursesToUpsert.length > 0) {
      await db
        .insert(courses)
        .values(coursesToUpsert)
        .onConflictDoUpdate({
          target: courses.code,
          set: {
            title: courses.title,
            instructor: courses.instructor,
            isOfficial: courses.isOfficial,
            updatedAt: new Date(),
          },
        });
    }

    // Delete stale courses
    if (deleted > 0) {
      const staleIds = existingCourses
        .filter((c) => staleCodes.includes(c.code))
        .map((c) => c.id);

      if (staleIds.length > 0) {
        await db.delete(courses).where(inArray(courses.id, staleIds));
      }
    }
  }

  return {
    created,
    updated,
    unchanged,
    deleted,
    total: allCourses.size,
    terms,
    deletionSkipped,
  };
}
