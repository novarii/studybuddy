import { authenticateAgent } from '@/lib/agent-auth';
import { listCourseDocuments } from '@/lib/agent/materials';

/**
 * GET /api/agent/documents?courseId=...
 *
 * List documents (PDFs/slides) the user owns for a given course.
 * Auth: X-API-Key header.
 */
export async function GET(req: Request) {
  const agentAuth = await authenticateAgent(req);
  if (!agentAuth) {
    return Response.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const url = new URL(req.url);
  const courseId = url.searchParams.get('courseId');

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  return Response.json({
    documents: await listCourseDocuments(agentAuth.userId, courseId),
  });
}
