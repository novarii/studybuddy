import { auth } from '@clerk/nextjs/server';
import { eq, and, asc } from 'drizzle-orm';

import { db, chatSessions, chatMessages } from '@/lib/db';
import { loadSourcesForSession } from '@/lib/sources/deduplicated-sources';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  // Verify session exists and belongs to user
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId)
    ),
  });

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Get all messages for the session
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
  });

  // Load sources from deduplicated course_sources table
  const sourcesByMessageId = await loadSourcesForSession(sessionId);

  return Response.json({
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      // Transform snake_case to camelCase for API response
      // Note: msg.id is UUID, sourcesByMessageId keys are strings
      sources: msg.role === 'assistant'
        ? (sourcesByMessageId[String(msg.id)] || []).map((src) => ({
            sourceId: src.source_id,
            sourceType: src.source_type,
            chunkNumber: src.chunk_number,
            contentPreview: src.content_preview,
            documentId: src.document_id,
            slideNumber: src.slide_number,
            lectureId: src.lecture_id,
            startSeconds: src.start_seconds,
            endSeconds: src.end_seconds,
            courseId: src.course_id,
            title: src.title,
          }))
        : undefined,
    })),
  });
}
