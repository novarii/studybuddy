# MCP Server

**Status:** Accepted

StudyBuddy exposes the user's course materials to AI clients (Claude Code, Claude Desktop, Cursor, etc.) as a remote MCP server.

## Protocol

- Targets MCP spec revision **2026-07-28**, via `@modelcontextprotocol/server` v2.
- The protocol is **stateless**: no `initialize` handshake, no `Mcp-Session-Id`. Each request carries its protocol version and client capabilities in `_meta`. A fresh `McpServer` is built **per HTTP request** by `createMcpHandler`.
- Older (2025-era) clients get stateless fallback serving from the same factory (`legacy: 'stateless'`, the SDK default).
- Transport: Streamable HTTP at `POST /api/mcp`. GET and DELETE are routed to the handler too; it answers them per spec (405 for legacy session ops).

## Auth

Two credentials are accepted, resolved in `lib/mcp/oauth.ts` (`authenticateMcpRequest`):

1. **Clerk OAuth access token** (primary). StudyBuddy is the OAuth resource server and Clerk (`clerk.studybuddy.me`) is the authorization server.
   - Discovery: `GET /.well-known/oauth-protected-resource/api/mcp` (RFC 9728; also served at `/.well-known/oauth-protected-resource`) returns `resource`, `authorization_servers: [<Clerk issuer>]`, `scopes_supported: ["profile","email"]`.
   - `/.well-known/oauth-authorization-server` mirrors Clerk's RFC 8414 metadata for older clients.
   - Tokens are verified with `auth({ acceptsToken: 'oauth_token' })`.
   - Client registration: **CIMD** (Client ID Metadata Documents), which spec 2026-07-28 prefers. Enabled in Clerk Dashboard > OAuth applications > Settings > Client onboarding, with client admission set to "Any compatible CIMD client". Clerk shows a consent screen and requires PKCE S256.
   - **DCR is off**. It is deprecated in the spec, and Clerk warns it opens a public registration endpoint. Turn it on only if a client you need can't do CIMD.
2. **Agent API key** (`sb_...`) as `Authorization: Bearer sb_...` or `X-API-Key`, for scripts and clients without OAuth. See `lib/agent-auth.ts`.

- A missing or invalid credential gets `401` with `WWW-Authenticate: Bearer resource_metadata="<metadata URL>", scope="profile email"`.
- `/api/mcp(.*)` and `/.well-known(.*)` are public routes in `proxy.ts`. Auth happens in the route, not in Clerk middleware.
- The Clerk issuer is decoded from `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`. The resource URL uses `NEXT_PUBLIC_APP_URL`.
- The route passes `userId` into the server factory through `authInfo.extra`. The raw credential is never forwarded to tools.

## Tools

All tools are read-only (`readOnlyHint: true`) and return both `structuredContent` (matching an `outputSchema`) and a JSON text block. Registration order is the `tools/list` order.

| Tool | Input | Output |
|------|-------|--------|
| `list_courses` | — | `{ courses: [{ id, code, title, instructor }] }` |
| `list_lectures` | `courseId` | `{ lectures: [{ id, title, durationSeconds, status, createdAt }] }` |
| `list_documents` | `courseId` | `{ documents: [{ id, filename, pageCount, status, createdAt }] }` |
| `search_materials` | `courseId`, `query`, `lectureId?`, `documentId?` | `{ results: [{ content, source, type, link? }] }` |

`search_materials` checks enrollment first. If the user isn't enrolled, it returns a tool error (`isError: true`), not a protocol error, so the model can recover.

## Code layout

| File | Role |
|------|------|
| `lib/agent/materials.ts` | User-scoped queries shared by the REST Agent API (`/api/agent/*`) and MCP. Change behavior here so both surfaces stay in sync. |
| `lib/mcp/server.ts` | `createStudyBuddyMcpServer(userId)`: tool definitions and server instructions |
| `lib/mcp/oauth.ts` | OAuth/API-key auth, resource + issuer URLs, 401 challenge |
| `app/api/mcp/route.ts` | Auth + `createMcpHandler(...).fetch` |
| `app/.well-known/oauth-protected-resource/[[...path]]/route.ts` | RFC 9728 metadata |
| `app/.well-known/oauth-authorization-server/route.ts` | Mirrored Clerk RFC 8414 metadata |
| `__tests__/api/mcp/route.test.ts` | End-to-end tests using the real `@modelcontextprotocol/client` v2 against the route handlers |

## Client configuration

OAuth (Claude Code, claude.ai connectors, Cursor): add the URL and sign in when prompted.

```bash
claude mcp add --transport http studybuddy https://app.studybuddy.me/api/mcp
```

API key:

```bash
claude mcp add --transport http studybuddy https://app.studybuddy.me/api/mcp \
  --header "Authorization: Bearer $STUDYBUDDY_API_KEY"
```

Generic `mcp.json`:

```json
{
  "mcpServers": {
    "studybuddy": {
      "type": "http",
      "url": "https://app.studybuddy.me/api/mcp",
      "headers": { "Authorization": "Bearer ${STUDYBUDDY_API_KEY}" }
    }
  }
}
```
