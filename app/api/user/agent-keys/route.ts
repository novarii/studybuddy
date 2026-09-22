import { randomBytes, createHash } from 'crypto';
import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db, agentApiKeys } from '@/lib/db';

/**
 * POST /api/user/agent-keys
 *
 * Generate a new agent API key. The raw key is returned once and never stored.
 * Body: { label?: string }
 */
export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const label = typeof body.label === 'string' ? body.label.trim().slice(0, 100) || null : null;

  // Generate sb_-prefixed key
  const rawKey = `sb_${randomBytes(32).toString('hex')}`;
  const keyHash = createHash('sha256').update(rawKey).digest('hex');

  const [record] = await db
    .insert(agentApiKeys)
    .values({ userId, keyHash, label })
    .returning({ id: agentApiKeys.id, createdAt: agentApiKeys.createdAt });

  return Response.json(
    {
      id: record.id,
      key: rawKey,
      label,
      createdAt: record.createdAt?.toISOString(),
    },
    { status: 201 }
  );
}

/**
 * GET /api/user/agent-keys
 *
 * List active agent API keys (without the raw key).
 */
export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const keys = await db.query.agentApiKeys.findMany({
    where: eq(agentApiKeys.userId, userId),
    orderBy: (k, { desc }) => [desc(k.createdAt)],
  });

  return Response.json({
    keys: keys.map((k) => ({
      id: k.id,
      label: k.label,
      lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
      createdAt: k.createdAt.toISOString(),
    })),
  });
}
