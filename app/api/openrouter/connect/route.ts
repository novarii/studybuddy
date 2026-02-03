import { auth } from '@clerk/nextjs/server';
import { randomBytes, createHash } from 'crypto';

export async function GET() {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl) {
    return Response.json(
      { error: 'Server configuration error: NEXT_PUBLIC_APP_URL not set' },
      { status: 500 }
    );
  }

  // Generate PKCE values
  const codeVerifier = randomBytes(32).toString('base64url');
  const codeChallenge = createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');

  const callbackUrl = `${appUrl}/api/openrouter/callback`;

  const authUrl = new URL('https://openrouter.ai/auth');
  authUrl.searchParams.set('callback_url', callbackUrl);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  // Return redirect with code verifier stored in secure cookie
  return new Response(null, {
    status: 302,
    headers: {
      Location: authUrl.toString(),
      'Set-Cookie': `openrouter_verifier=${codeVerifier}; HttpOnly; Secure; SameSite=Lax; Max-Age=600; Path=/`,
    },
  });
}
