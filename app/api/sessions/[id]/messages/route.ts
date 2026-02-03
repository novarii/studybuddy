import { auth } from '@clerk/nextjs/server';
import { eq, and, asc } from 'drizzle-orm';

import { db, chatSessions, chatMessages, messageSources } from '@/lib/db';

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

  // Get sources for all messages in this session
  const sources = await db.query.messageSources.findMany({
    where: eq(messageSources.sessionId, sessionId),
  });

  // Define the shape of sources we return to the client
  type SourceResponse = {
    sourceId: string;
    sourceType: string;
    chunkNumber: number;
    contentPreview: string | null;
    documentId: string | null;
    slideNumber: number | null;
    lectureId: string | null;
    startSeconds: number | null;
    endSeconds: number | null;
    courseId: string | null;
    title: string | null;
  };

  // Group sources by messageId
  const sourcesByMessageId = sources.reduce(
    (acc, source) => {
      if (!acc[source.messageId]) {
        acc[source.messageId] = [];
      }
      acc[source.messageId].push({
        sourceId: source.sourceId,
        sourceType: source.sourceType,
        chunkNumber: source.chunkNumber,
        contentPreview: source.contentPreview,
        documentId: source.documentId,
        slideNumber: source.slideNumber,
        lectureId: source.lectureId,
        startSeconds: source.startSeconds,
        endSeconds: source.endSeconds,
        courseId: source.courseId,
        title: source.title,
      });
      return acc;
    },
    {} as Record<string, SourceResponse[]>
  );

  return Response.json({
    messages: messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.createdAt.toISOString(),
      sources: msg.role === 'assistant' ? sourcesByMessageId[msg.id] || [] : undefined,
    })),
  });
}
