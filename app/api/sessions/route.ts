import { auth } from '@clerk/nextjs/server';
import { eq, and, desc } from 'drizzle-orm';

import { db, chatSessions } from '@/lib/db';

interface CreateSessionBody {
  courseId: string;
  title?: string;
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');

  const sessions = await db.query.chatSessions.findMany({
    where: courseId
      ? and(eq(chatSessions.userId, userId), eq(chatSessions.courseId, courseId))
      : eq(chatSessions.userId, userId),
    orderBy: [desc(chatSessions.updatedAt)],
  });

  return Response.json({
    sessions: sessions.map((session) => ({
      id: session.id,
      courseId: session.courseId,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    })),
  });
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: CreateSessionBody = await req.json();
  const { courseId, title } = body;

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  const [session] = await db
    .insert(chatSessions)
    .values({
      userId,
      courseId,
      title: title || null,
    })
    .returning();

  return Response.json(
    {
      id: session.id,
      courseId: session.courseId,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    },
    { status: 201 }
  );
}
