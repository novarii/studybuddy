import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';

import { db, userApiKeys } from '@/lib/db';
import { encryptApiKey } from '@/lib/crypto/encryption';

interface OpenRouterKeyResponse {
  key: string;
}

interface OpenRouterKeyInfo {
  data?: {
    limit_remaining?: number;
    limit?: number;
    is_free_tier?: boolean;
  };
}

export async function GET(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.redirect(new URL('/sign-in', req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || '';
  const settingsUrl = new URL('/settings', appUrl || req.url);

  if (!code) {
    settingsUrl.searchParams.set('error', 'no_code');
    return Response.redirect(settingsUrl.toString());
  }

  // Retrieve code_verifier from cookie
  const cookieStore = await cookies();
  const codeVerifier = cookieStore.get('openrouter_verifier')?.value;

  if (!codeVerifier) {
    settingsUrl.searchParams.set('error', 'missing_verifier');
    return Response.redirect(settingsUrl.toString());
  }

  // Exchange code for API key
  let tokenResponse: Response;
  try {
    tokenResponse = await fetch('https://openrouter.ai/api/v1/auth/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        code,
        code_verifier: codeVerifier,
        code_challenge_method: 'S256',
      }),
    });
  } catch (error) {
    console.error('OpenRouter token exchange network error:', error);
    settingsUrl.searchParams.set('error', 'exchange_failed');
    return Response.redirect(settingsUrl.toString());
  }

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('OpenRouter token exchange failed:', errorText);
    settingsUrl.searchParams.set('error', 'exchange_failed');
    return Response.redirect(settingsUrl.toString());
  }

  const { key } = (await tokenResponse.json()) as OpenRouterKeyResponse;

  // Fetch key metadata (optional - don't fail if this errors)
  let keyInfo: OpenRouterKeyInfo['data'] = undefined;
  try {
    const keyInfoResponse = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${key}` },
    });
    if (keyInfoResponse.ok) {
      const keyInfoData = (await keyInfoResponse.json()) as OpenRouterKeyInfo;
      keyInfo = keyInfoData.data;
    }
  } catch (error) {
    console.error('Failed to fetch key metadata:', error);
    // Continue without metadata
  }

  // Encrypt and store
  const encrypted = encryptApiKey(key);
  const keyLabel = `sk-or-v1-...${key.slice(-8)}`;
  const keyHash = key.slice(0, 32); // Use first 32 chars as identifier hash

  await db
    .insert(userApiKeys)
    .values({
      userId,
      openrouterKeyEncrypted: encrypted,
      openrouterKeyHash: keyHash,
      keyLabel,
      creditsRemaining: keyInfo?.limit_remaining?.toString() ?? null,
      creditsLimit: keyInfo?.limit?.toString() ?? null,
      isFreeTier: keyInfo?.is_free_tier ?? true,
      connectedAt: new Date(),
      lastVerifiedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: userApiKeys.userId,
      set: {
        openrouterKeyEncrypted: encrypted,
        openrouterKeyHash: keyHash,
        keyLabel,
        creditsRemaining: keyInfo?.limit_remaining?.toString() ?? null,
        creditsLimit: keyInfo?.limit?.toString() ?? null,
        isFreeTier: keyInfo?.is_free_tier ?? true,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
        updatedAt: new Date(),
      },
    });

  // Clear the verifier cookie and redirect to success
  settingsUrl.searchParams.set('connected', 'true');

  return new Response(null, {
    status: 302,
    headers: {
      Location: settingsUrl.toString(),
      'Set-Cookie':
        'openrouter_verifier=; HttpOnly; Secure; Max-Age=0; Path=/',
    },
  });
}
