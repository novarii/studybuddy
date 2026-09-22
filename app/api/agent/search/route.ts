import { authenticateAgent } from '@/lib/agent-auth';
import { isEnrolled, searchCourseMaterials } from '@/lib/agent/materials';

/**
 * POST /api/agent/search
 *
 * Search course materials (lectures + slides) via vector similarity.
 * Returns lean results with full chunk text, source labels, and Panopto links.
 *
 * Auth: X-API-Key header with sb_-prefixed key.
 * Body: { courseId: string, query: string, lectureId?: string, documentId?: string }
 */
export async function POST(req: Request) {
  const agentAuth = await authenticateAgent(req);
  if (!agentAuth) {
    return Response.json(
      { error: 'Invalid or missing API key' },
      { status: 401 }
    );
  }

  const body = await req.json();
  const { courseId, query, documentId, lectureId } = body;

  if (!courseId || !query) {
    return Response.json(
      { error: 'courseId and query are required' },
      { status: 400 }
    );
  }

  if (!(await isEnrolled(agentAuth.userId, courseId))) {
    return Response.json(
      { error: 'Not enrolled in this course' },
      { status: 403 }
    );
  }

  const results = await searchCourseMaterials({
    userId: agentAuth.userId,
    courseId,
    query,
    documentId,
    lectureId,
  });

  return Response.json({ results });
}
