import { auth } from '@clerk/nextjs/server';
import { eq, and } from 'drizzle-orm';

import { db, chatSessions } from '@/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function DELETE(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;

  // Verify session exists and belongs to user
  const session = await db.query.chatSessions.findFirst({
    where: and(eq(chatSessions.id, id), eq(chatSessions.userId, userId)),
  });

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Delete session (cascade will delete messages and sources)
  await db.delete(chatSessions).where(eq(chatSessions.id, id));

  return new Response(null, { status: 204 });
}
