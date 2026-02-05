/**
 * Cron Job: Course Sync
 *
 * Syncs courses from CDCS (University of Rochester Course Catalog)
 * Protected by CRON_SECRET header (Vercel Cron pattern)
 *
 * Schedule: Monthly on the 1st at 6am UTC (configured in vercel.json)
 */

import { syncCourses } from '@/lib/courses';

export async function GET(req: Request) {
  // Verify cron secret (Vercel sets this automatically for cron jobs)
  const authHeader = req.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const result = await syncCourses({
      terms: ['Fall 2025', 'Spring 2025'],
    });

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Course sync failed:', message);
    return Response.json({ error: message }, { status: 500 });
  }
}
