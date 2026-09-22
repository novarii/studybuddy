import {
  MCP_SCOPES,
  clerkIssuer,
  mcpResourceUrl,
} from '@/lib/mcp/oauth';

/**
 * OAuth 2.0 Protected Resource Metadata (RFC 9728) for the MCP server.
 *
 * Served at both /.well-known/oauth-protected-resource and the path-inserted
 * form /.well-known/oauth-protected-resource/api/mcp that MCP clients try first.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export function GET(req: Request) {
  return Response.json(
    {
      resource: mcpResourceUrl(req),
      authorization_servers: [clerkIssuer()],
      scopes_supported: MCP_SCOPES,
      bearer_methods_supported: ['header'],
      resource_name: 'StudyBuddy',
    },
    { headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' } }
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
