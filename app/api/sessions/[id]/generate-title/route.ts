import { auth } from '@clerk/nextjs/server';
import { eq, and, asc } from 'drizzle-orm';

import { db, chatSessions, chatMessages } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
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

  // Get messages to generate title from
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
  });

  if (messages.length === 0) {
    return Response.json({ title: null });
  }

  // Find first user message to generate title from
  const firstUserMessage = messages.find((msg) => msg.role === 'user');

  if (!firstUserMessage) {
    return Response.json({ title: null });
  }

  // Generate title from first user message (truncate to 50 chars)
  let title = firstUserMessage.content.slice(0, 50);
  if (firstUserMessage.content.length > 50) {
    title += '...';
  }

  // Update session with generated title
  const [updatedSession] = await db
    .update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .returning();

  return Response.json({ title: updatedSession.title });
}
