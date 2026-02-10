import { eq } from 'drizzle-orm';
import { db, userApiKeys } from '@/lib/db';

/** Check whether the user has a connected OpenRouter API key. */
export async function hasApiKey(userId: string): Promise<boolean> {
  const row = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
    columns: { id: true },
  });
  return !!row;
}
