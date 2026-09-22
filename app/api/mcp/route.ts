import { createMcpHandler } from '@modelcontextprotocol/server';

import { authenticateMcpRequest, unauthorizedResponse } from '@/lib/mcp/oauth';
import { createStudyBuddyMcpServer } from '@/lib/mcp/server';

/**
 * /api/mcp — StudyBuddy MCP server over Streamable HTTP.
 *
 * Serves MCP 2026-07-28 (stateless, per-request) and falls back to stateless
 * 2025-era serving for older clients. Auth: Clerk OAuth access token
 * (discovered via /.well-known/oauth-protected-resource/api/mcp) or an
 * sb_ agent API key.
 *
 * See .agent/specs/mcp-server.md.
 */

export const runtime = 'nodejs';
export const maxDuration = 60;

const handler = createMcpHandler(
  ({ authInfo }) => createStudyBuddyMcpServer(authInfo!.extra!.userId as string),
  { onerror: (error) => console.error('[mcp]', error) }
);

async function handle(req: Request): Promise<Response> {
  const mcpAuth = await authenticateMcpRequest(req);
  if (!mcpAuth) return unauthorizedResponse(req);

  return handler.fetch(req, {
    authInfo: {
      // The raw credential is never forwarded to tool handlers.
      token: mcpAuth.method,
      clientId: mcpAuth.clientId,
      scopes: mcpAuth.scopes,
      extra: { userId: mcpAuth.userId },
    },
  });
}

export { handle as GET, handle as POST, handle as DELETE };
