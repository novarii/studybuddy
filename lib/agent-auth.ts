import { createHash } from 'crypto';
import { eq } from 'drizzle-orm';
import { db, agentApiKeys } from '@/lib/db';

export interface AgentAuthResult {
  userId: string;
  keyId: string;
}

/**
 * Extract an sb_-prefixed key from `X-API-Key` or `Authorization: Bearer`.
 * MCP clients typically send the Bearer form; the REST API documents X-API-Key.
 */
function extractApiKey(req: Request): string | null {
  const headerKey = req.headers.get('X-API-Key');
  if (headerKey) return headerKey;

  const authorization = req.headers.get('Authorization');
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Authenticate an agent request via X-API-Key or Authorization: Bearer header.
 *
 * Looks up the SHA-256 hash of the provided key in the agent_api_keys table.
 * Returns the associated userId if found, or null if invalid/missing.
 */
export async function authenticateAgent(
  req: Request
): Promise<AgentAuthResult | null> {
  const apiKey = extractApiKey(req);
  if (!apiKey || !apiKey.startsWith('sb_')) return null;

  const keyHash = createHash('sha256').update(apiKey).digest('hex');

  const record = await db.query.agentApiKeys.findFirst({
    where: eq(agentApiKeys.keyHash, keyHash),
  });

  if (!record) return null;

  // Fire-and-forget: update lastUsedAt
  db.update(agentApiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(agentApiKeys.id, record.id))
    .then(() => {})
    .catch(() => {});

  return { userId: record.userId, keyId: record.id };
}
