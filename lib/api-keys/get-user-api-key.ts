import { eq } from 'drizzle-orm';
import { db, userApiKeys } from '@/lib/db';
import { decryptApiKey } from '@/lib/crypto';

/**
 * Get the user's OpenRouter API key (BYOK) or fall back to shared key.
 *
 * This function:
 * 1. Looks up the user's encrypted API key from the database
 * 2. Decrypts it if found
 * 3. Falls back to OPENROUTER_API_KEY env var if no user key or decryption fails
 *
 * @param userId - The Clerk user ID
 * @returns The API key to use for OpenRouter requests
 * @throws Error if neither user key nor shared key is available
 */
export async function getUserApiKey(userId: string): Promise<string> {
  // Start with shared key as fallback
  let apiKey = process.env.OPENROUTER_API_KEY;

  // Try to get user's own key
  const userKey = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
  });

  if (userKey) {
    try {
      apiKey = decryptApiKey(userKey.openrouterKeyEncrypted);
    } catch {
      console.error(
        `Failed to decrypt API key for user ${userId}, using shared key`
      );
      // Fall back to shared key (apiKey remains unchanged)
    }
  }

  if (!apiKey) {
    throw new Error(
      'No API key available: user has no BYOK key and OPENROUTER_API_KEY is not set'
    );
  }

  return apiKey;
}
