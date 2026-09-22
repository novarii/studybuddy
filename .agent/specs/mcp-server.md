# MCP Server

**Status:** Accepted

StudyBuddy exposes the user's course materials to AI clients (Claude Code, Claude Desktop, Cursor, etc.) as a remote MCP server.

## Protocol

- Targets MCP spec revision **2026-07-28**, via `@modelcontextprotocol/server` v2.
- The protocol is **stateless**: no `initialize` handshake, no `Mcp-Session-Id`. Each request carries its protocol version and client capabilities in `_meta`. A fresh `McpServer` is built **per HTTP request** by `createMcpHandler`.
- Older (2025-era) clients get stateless fallback serving from the same factory (`legacy: 'stateless'`, the SDK default).
- Transport: Streamable HTTP at `POST /api/mcp`. GET and DELETE are routed to the handler too; it answers them per spec (405 for legacy session ops).

## Auth

- Reuses **agent API keys** (`sb_...`, created in Settings > Agent API keys). See `lib/agent-auth.ts`.
- Accepted headers: `Authorization: Bearer sb_...` (preferred for MCP clients) or `X-API-Key: sb_...`.
- Missing or invalid key → `401` with `WWW-Authenticate: Bearer`.
- `/api/mcp(.*)` is a public route in `proxy.ts`. The route authenticates by itself, not through Clerk.
- The route passes `userId` into the server factory through `authInfo.extra`. Every tool is scoped to that user.
- OAuth (protected resource metadata / authorization server discovery) is **not** implemented. Clients must support custom headers.

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
| `app/api/mcp/route.ts` | Auth + `createMcpHandler(...).fetch` |
| `__tests__/api/mcp/route.test.ts` | End-to-end tests using the real `@modelcontextprotocol/client` v2 against the route handlers |

## Client configuration

Claude Code:

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
