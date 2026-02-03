import { auth } from '@clerk/nextjs/server';
import { eq } from 'drizzle-orm';

import { db, userApiKeys } from '@/lib/db';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const userKey = await db.query.userApiKeys.findFirst({
    where: eq(userApiKeys.userId, userId),
  });

  if (!userKey) {
    return Response.json({
      connected: false,
      usingSharedKey: true,
    });
  }

  // Return connection status without exposing encrypted key or hash
  return Response.json({
    connected: true,
    usingSharedKey: false,
    keyLabel: userKey.keyLabel,
    creditsRemaining: userKey.creditsRemaining,
    creditsLimit: userKey.creditsLimit,
    isFreeTier: userKey.isFreeTier,
    connectedAt: userKey.connectedAt?.toISOString() ?? null,
    lastVerifiedAt: userKey.lastVerifiedAt?.toISOString() ?? null,
  });
}
