import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db, userApiKeys } from '@/lib/db';

export async function DELETE() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    await db.delete(userApiKeys).where(eq(userApiKeys.userId, userId));
    return Response.json({ success: true });
  } catch (error) {
    console.error('Failed to disconnect OpenRouter:', error);
    return Response.json(
      { error: 'Failed to disconnect' },
      { status: 500 }
    );
  }
}
