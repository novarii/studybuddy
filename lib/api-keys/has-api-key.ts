import { eq } from 'drizzle-orm';
import { db, userApiKeys } from '@/lib/db';

/**
 * Check whether the user has a connected OpenRouter API key.
 * Returns true if:
 * - User has their own BYOK key in the database, OR
 * - A fallback OPENROUTER_API_KEY env var is set (for test users)
 */
export async function hasApiKey(userId: string): Promise<boolean> {
  // If fallback key is set, allow all users to bypass onboarding
  if (process.env.OPENROUTER_API_KEY) {
    return true;
  }

  // Otherwise check if user has their own key
  const row = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
    columns: { id: true },
  });
  return !!row;
}
