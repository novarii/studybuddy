// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';

vi.mock('@/lib/agent-auth', () => ({
  authenticateAgent: vi.fn(),
}));

vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/agent/materials', () => ({
  listEnrolledCourses: vi.fn(),
  listCourseLectures: vi.fn(),
  listCourseDocuments: vi.fn(),
  isEnrolled: vi.fn(),
  searchCourseMaterials: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';
import { authenticateAgent } from '@/lib/agent-auth';
import {
  listEnrolledCourses,
  isEnrolled,
  searchCourseMaterials,
} from '@/lib/agent/materials';
import { POST, GET, DELETE } from '@/app/api/mcp/route';
import { GET as getResourceMetadata } from '@/app/.well-known/oauth-protected-resource/[[...path]]/route';

// pk_test_ + base64("clerk.example.com$")
process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY = `pk_test_${Buffer.from('clerk.example.com$').toString('base64')}`;
process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.com/';

const MCP_URL = 'http://localhost:3000/api/mcp';

/** Routes the real MCP client straight into the Next.js route handlers. */
const routeFetch = async (
  input: string | URL | Request,
  init?: RequestInit
): Promise<Response> => {
  const req = new Request(input, init);
  const handler = { POST, GET, DELETE }[req.method as 'POST' | 'GET' | 'DELETE'];
  return handler ? handler(req) : new Response(null, { status: 405 });
};

async function connectClient(token = 'sb_test') {
  const client = new Client({ name: 'test-client', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: routeFetch,
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
}

describe('/api/mcp', () => {
  const mockAuth = authenticateAgent as unknown as ReturnType<typeof vi.fn>;
  const mockClerkAuth = auth as unknown as ReturnType<typeof vi.fn>;
  let client: Client | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.mockResolvedValue({ userId: 'user_123', keyId: 'key_1' });
    mockClerkAuth.mockResolvedValue({ isAuthenticated: false, userId: null });
  });

  afterEach(async () => {
    await client?.close();
    client = undefined;
  });

  it('rejects requests without a valid API key', async () => {
    mockAuth.mockResolvedValue(null);

    const res = await POST(
      new Request(MCP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    );

    expect(res.status).toBe(401);
    expect(res.headers.get('WWW-Authenticate')).toContain(
      'resource_metadata="https://app.example.com/.well-known/oauth-protected-resource/api/mcp"'
    );
  });

  it('rejects an OAuth token Clerk does not accept', async () => {
    const res = await POST(
      new Request(MCP_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer oat_bad',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
      })
    );

    expect(res.status).toBe(401);
    expect(mockClerkAuth).toHaveBeenCalledWith({ acceptsToken: 'oauth_token' });
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('accepts a Clerk OAuth access token', async () => {
    mockClerkAuth.mockResolvedValue({
      isAuthenticated: true,
      userId: 'user_oauth',
      clientId: 'client_1',
      scopes: ['profile', 'email'],
    });
    vi.mocked(listEnrolledCourses).mockResolvedValue([]);

    client = await connectClient('oat_valid');
    await client.callTool({ name: 'list_courses', arguments: {} });

    expect(listEnrolledCourses).toHaveBeenCalledWith('user_oauth');
    expect(mockAuth).not.toHaveBeenCalled();
  });

  it('serves protected resource metadata pointing at Clerk', async () => {
    const res = getResourceMetadata(
      new Request('https://app.example.com/.well-known/oauth-protected-resource/api/mcp')
    );
    const body = await res.json();

    expect(body.resource).toBe('https://app.example.com/api/mcp');
    expect(body.authorization_servers).toEqual(['https://clerk.example.com']);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
  });

  it('lists the StudyBuddy tools in a stable order', async () => {
    client = await connectClient();
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name)).toEqual([
      'list_courses',
      'list_lectures',
      'list_documents',
      'search_materials',
    ]);
    expect(tools.every((t) => t.annotations?.readOnlyHint)).toBe(true);
  });

  it('list_courses returns courses for the authenticated user', async () => {
    const courses = [
      { id: 'c1', code: 'CSC 171', title: 'Intro to CS', instructor: null },
    ];
    vi.mocked(listEnrolledCourses).mockResolvedValue(courses);

    client = await connectClient();
    const result = await client.callTool({ name: 'list_courses', arguments: {} });

    expect(listEnrolledCourses).toHaveBeenCalledWith('user_123');
    expect(result.structuredContent).toEqual({ courses });
  });

  it('search_materials returns results when enrolled', async () => {
    const results = [
      {
        content: 'Heaps are complete binary trees',
        source: 'Lecture 5 @ 12:30',
        type: 'lecture' as const,
        link: 'https://panopto.example/v?id=1&start=750',
      },
    ];
    vi.mocked(isEnrolled).mockResolvedValue(true);
    vi.mocked(searchCourseMaterials).mockResolvedValue(results);

    client = await connectClient();
    const result = await client.callTool({
      name: 'search_materials',
      arguments: { courseId: 'c1', query: 'heap', lectureId: 'l1' },
    });

    expect(searchCourseMaterials).toHaveBeenCalledWith({
      userId: 'user_123',
      courseId: 'c1',
      query: 'heap',
      lectureId: 'l1',
      documentId: undefined,
    });
    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ results });
  });

  it('search_materials returns a tool error when not enrolled', async () => {
    vi.mocked(isEnrolled).mockResolvedValue(false);

    client = await connectClient();
    const result = await client.callTool({
      name: 'search_materials',
      arguments: { courseId: 'c9', query: 'heap' },
    });

    expect(result.isError).toBe(true);
    expect(searchCourseMaterials).not.toHaveBeenCalled();
  });
});
