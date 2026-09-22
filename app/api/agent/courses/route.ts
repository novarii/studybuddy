import { authenticateAgent } from '@/lib/agent-auth';
import { listEnrolledCourses } from '@/lib/agent/materials';

/**
 * GET /api/agent/courses
 *
 * List enrolled courses for the authenticated agent user.
 * Auth: X-API-Key header with sb_-prefixed key.
 */
export async function GET(req: Request) {
  const agentAuth = await authenticateAgent(req);
  if (!agentAuth) {
    return Response.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  return Response.json({ courses: await listEnrolledCourses(agentAuth.userId) });
}
