import { eq, and, inArray } from 'drizzle-orm';
import { db, courseSources, messageSourceRefs } from '@/lib/db';
import type { RAGSource } from '@/types';

/**
 * Generate a unique key for a source based on its type and identifiers.
 * This key is used for deduplication within a course.
 */
function generateSourceKey(source: RAGSource): string {
  if (source.source_type === 'slide' && source.document_id && source.slide_number) {
    return `doc_${source.document_id}_slide_${source.slide_number}`;
  }
  if (source.source_type === 'lecture' && source.lecture_id) {
    const start = Math.floor(source.start_seconds ?? 0);
    const end = Math.floor(source.end_seconds ?? 0);
    return `lec_${source.lecture_id}_${start}_${end}`;
  }
  // Fallback to source_id if available
  return source.source_id;
}

/**
 * Save sources with deduplication at the course level.
 *
 * 1. For each source, check if it exists in course_sources
 * 2. If not, create it
 * 3. Create lightweight refs in message_source_refs
 */
export async function saveSourcesWithDedup(
  sources: RAGSource[],
  messageId: string,
  sessionId: string,
  courseId: string
): Promise<void> {
  if (sources.length === 0) {
    console.log('[saveSourcesWithDedup] No sources to save');
    return;
  }
  console.log(`[saveSourcesWithDedup] Saving ${sources.length} sources for message=${messageId}, session=${sessionId}, course=${courseId}`);

  // Generate keys for all sources
  const sourcesWithKeys = sources.map((source) => ({
    source,
    key: generateSourceKey(source),
  }));

  // Get existing course sources for these keys
  const existingKeys = sourcesWithKeys.map((s) => s.key);
  const existingSources = await db
    .select({ id: courseSources.id, sourceKey: courseSources.sourceKey })
    .from(courseSources)
    .where(
      and(
        eq(courseSources.courseId, courseId),
        inArray(courseSources.sourceKey, existingKeys)
      )
    );

  const existingKeyMap = new Map(
    existingSources.map((s) => [s.sourceKey, s.id])
  );

  // Separate new sources from existing ones, deduplicating within the batch
  // (multiple tool calls can return the same source)
  const seenKeys = new Set<string>();
  const newSources = sourcesWithKeys.filter(({ key }) => {
    if (existingKeyMap.has(key) || seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });

  // Insert new sources into course_sources
  if (newSources.length > 0) {
    const inserted = await db
      .insert(courseSources)
      .values(
        newSources.map(({ source, key }) => ({
          courseId,
          sourceKey: key,
          sourceType: source.source_type,
          documentId: source.document_id,
          slideNumber: source.slide_number,
          lectureId: source.lecture_id,
          startSeconds: source.start_seconds,
          endSeconds: source.end_seconds,
          contentPreview: source.content_preview,
          title: source.title,
        }))
      )
      .onConflictDoNothing()
      .returning({ id: courseSources.id, sourceKey: courseSources.sourceKey });

    // Add new IDs to the map
    for (const row of inserted) {
      existingKeyMap.set(row.sourceKey, row.id);
    }

    // If onConflictDoNothing skipped any rows, re-fetch their IDs
    const missingKeys = newSources
      .filter(({ key }) => !existingKeyMap.has(key))
      .map(({ key }) => key);
    if (missingKeys.length > 0) {
      const missing = await db
        .select({ id: courseSources.id, sourceKey: courseSources.sourceKey })
        .from(courseSources)
        .where(
          and(
            eq(courseSources.courseId, courseId),
            inArray(courseSources.sourceKey, missingKeys)
          )
        );
      for (const row of missing) {
        existingKeyMap.set(row.sourceKey, row.id);
      }
    }
  }

  // Create message refs for all sources
  await db.insert(messageSourceRefs).values(
    sourcesWithKeys.map(({ source, key }) => ({
      messageId,
      sessionId,
      courseSourceId: existingKeyMap.get(key)!,
      chunkNumber: source.chunk_number,
    }))
  );
}

/**
 * Load sources for all messages in a session.
 * Joins message_source_refs with course_sources.
 */
export async function loadSourcesForSession(
  sessionId: string
): Promise<Record<string, RAGSource[]>> {
  // Get all refs for this session with their course sources
  const refs = await db
    .select({
      messageId: messageSourceRefs.messageId,
      chunkNumber: messageSourceRefs.chunkNumber,
      sourceType: courseSources.sourceType,
      sourceKey: courseSources.sourceKey,
      documentId: courseSources.documentId,
      slideNumber: courseSources.slideNumber,
      lectureId: courseSources.lectureId,
      startSeconds: courseSources.startSeconds,
      endSeconds: courseSources.endSeconds,
      contentPreview: courseSources.contentPreview,
      title: courseSources.title,
      courseId: courseSources.courseId,
    })
    .from(messageSourceRefs)
    .innerJoin(courseSources, eq(messageSourceRefs.courseSourceId, courseSources.id))
    .where(eq(messageSourceRefs.sessionId, sessionId));

  // Group by messageId
  const sourcesByMessageId: Record<string, RAGSource[]> = {};

  for (const ref of refs) {
    if (!sourcesByMessageId[ref.messageId]) {
      sourcesByMessageId[ref.messageId] = [];
    }
    sourcesByMessageId[ref.messageId].push({
      source_id: ref.sourceKey,
      source_type: ref.sourceType as 'slide' | 'lecture',
      chunk_number: ref.chunkNumber,
      content_preview: ref.contentPreview ?? '',
      document_id: ref.documentId ?? undefined,
      slide_number: ref.slideNumber ?? undefined,
      lecture_id: ref.lectureId ?? undefined,
      start_seconds: ref.startSeconds ?? undefined,
      end_seconds: ref.endSeconds ?? undefined,
      course_id: ref.courseId ?? undefined,
      title: ref.title ?? undefined,
    });
  }

  return sourcesByMessageId;
}
