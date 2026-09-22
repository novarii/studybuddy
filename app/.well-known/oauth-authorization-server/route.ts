import { clerkIssuer } from '@/lib/mcp/oauth';

/**
 * OAuth Authorization Server Metadata (RFC 8414), mirrored from Clerk.
 *
 * The current MCP spec discovers Clerk through protected resource metadata,
 * but some older clients only look for this document on the MCP server's own
 * origin.
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

export async function GET() {
  const res = await fetch(
    `${clerkIssuer()}/.well-known/oauth-authorization-server`,
    { next: { revalidate: 3600 } }
  );

  if (!res.ok) {
    return Response.json(
      { error: 'Authorization server metadata unavailable' },
      { status: 502, headers: CORS_HEADERS }
    );
  }

  return Response.json(await res.json(), {
    headers: { ...CORS_HEADERS, 'Cache-Control': 'public, max-age=3600' },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
