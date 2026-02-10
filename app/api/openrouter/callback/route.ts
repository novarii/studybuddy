import { auth } from '@clerk/nextjs/server';

import { db, userApiKeys } from '@/lib/db';
import { encryptApiKey } from '@/lib/crypto/encryption';
import { retrieveVerifier } from '@/lib/auth/pkce-store';

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
  const redirectUrl = new URL('/', appUrl || req.url);
  const errorRedirectUrl = new URL('/onboarding', appUrl || req.url);

  if (!code) {
    errorRedirectUrl.searchParams.set('error', 'oauth_no_code');
    return Response.redirect(errorRedirectUrl.toString());
  }

  // Retrieve code_verifier from memory store (keyed by userId)
  const codeVerifier = retrieveVerifier(userId);

  if (!codeVerifier) {
    errorRedirectUrl.searchParams.set('error', 'oauth_expired');
    return Response.redirect(errorRedirectUrl.toString());
  }

  // Exchange code for API key
  console.log('Exchanging code for API key...', {
    code: code.slice(0, 8) + '...',
    codeLength: code.length,
    verifier: codeVerifier.slice(0, 8) + '...',
    verifierLength: codeVerifier.length,
  });

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
    errorRedirectUrl.searchParams.set('error', 'oauth_exchange_failed');
    return Response.redirect(errorRedirectUrl.toString());
  }

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('OpenRouter token exchange failed:', {
      status: tokenResponse.status,
      statusText: tokenResponse.statusText,
      body: errorText,
      codeLength: code.length,
      verifierLength: codeVerifier.length,
    });
    errorRedirectUrl.searchParams.set('error', 'oauth_exchange_failed');
    return Response.redirect(errorRedirectUrl.toString());
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

  // Redirect to home with success flag
  redirectUrl.searchParams.set('api_key_connected', 'true');

  return Response.redirect(redirectUrl.toString());
}
