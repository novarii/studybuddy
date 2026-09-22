import { createMcpHandler } from '@modelcontextprotocol/server';

import { authenticateAgent } from '@/lib/agent-auth';
import { createStudyBuddyMcpServer } from '@/lib/mcp/server';

/**
 * /api/mcp — StudyBuddy MCP server over Streamable HTTP.
 *
 * Serves MCP 2026-07-28 (stateless, per-request) and falls back to stateless
 * 2025-era serving for older clients. Auth reuses agent API keys: send
 * `Authorization: Bearer sb_...` (or `X-API-Key: sb_...`).
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
  const agentAuth = await authenticateAgent(req);
  if (!agentAuth) {
    return Response.json(
      { error: 'Invalid or missing API key' },
      {
        status: 401,
        headers: { 'WWW-Authenticate': 'Bearer realm="studybuddy"' },
      }
    );
  }

  return handler.fetch(req, {
    authInfo: {
      token: agentAuth.keyId,
      clientId: agentAuth.keyId,
      scopes: [],
      extra: { userId: agentAuth.userId },
    },
  });
}

export { handle as GET, handle as POST, handle as DELETE };
