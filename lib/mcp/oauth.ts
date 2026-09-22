import { auth } from '@clerk/nextjs/server';

import { authenticateAgent } from '@/lib/agent-auth';

/**
 * MCP authorization (spec 2026-07-28, basic/authorization).
 *
 * StudyBuddy is the OAuth *resource server*; Clerk is the authorization
 * server. Clients discover Clerk through our protected resource metadata
 * (RFC 9728), sign the user in with Clerk, and send the resulting access token
 * as `Authorization: Bearer ...`. Agent API keys (sb_...) remain accepted for
 * scripts and clients without OAuth support.
 */

export const MCP_SCOPES = ['profile', 'email'];

const MCP_PATH = '/api/mcp';

export interface McpAuth {
  userId: string;
  clientId: string;
  scopes: string[];
  method: 'oauth' | 'api_key';
}

function appOrigin(req: Request): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  return configured ? new URL(configured).origin : new URL(req.url).origin;
}

/** Canonical MCP server URL, used as the RFC 9728 `resource` identifier. */
export function mcpResourceUrl(req: Request): string {
  return `${appOrigin(req)}${MCP_PATH}`;
}

/** RFC 9728 path-inserted metadata URL for the MCP resource. */
export function resourceMetadataUrl(req: Request): string {
  return `${appOrigin(req)}/.well-known/oauth-protected-resource${MCP_PATH}`;
}

/** Clerk Frontend API origin (the OAuth issuer), decoded from the publishable key. */
export function clerkIssuer(): string {
  const pk = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!pk) throw new Error('NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set');
  const host = Buffer.from(pk.split('_')[2], 'base64')
    .toString('utf8')
    .replace(/\$$/, '');
  return `https://${host}`;
}

function bearerToken(req: Request): string | null {
  const match = req.headers.get('Authorization')?.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : null;
}

/**
 * Resolve the calling user from an sb_ agent key or a Clerk OAuth access token.
 * Returns null when neither is present and valid.
 */
export async function authenticateMcpRequest(
  req: Request
): Promise<McpAuth | null> {
  const token = bearerToken(req);

  if (req.headers.has('X-API-Key') || token?.startsWith('sb_')) {
    const agentAuth = await authenticateAgent(req);
    return agentAuth
      ? {
          userId: agentAuth.userId,
          clientId: agentAuth.keyId,
          scopes: [],
          method: 'api_key',
        }
      : null;
  }

  if (!token) return null;

  const oauth = await auth({ acceptsToken: 'oauth_token' });
  if (!oauth.isAuthenticated || !oauth.userId) return null;

  return {
    userId: oauth.userId,
    clientId: oauth.clientId ?? 'unknown',
    scopes: oauth.scopes ?? [],
    method: 'oauth',
  };
}

/** 401 that points clients at the protected resource metadata (RFC 9728 §5.1). */
export function unauthorizedResponse(req: Request): Response {
  return Response.json(
    { error: 'invalid_token', error_description: 'Sign in with OAuth or send an sb_ agent API key' },
    {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer resource_metadata="${resourceMetadataUrl(req)}", scope="${MCP_SCOPES.join(' ')}"`,
      },
    }
  );
}
