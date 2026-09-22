import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import { z } from 'zod';

import {
  isEnrolled,
  listCourseDocuments,
  listCourseLectures,
  listEnrolledCourses,
  searchCourseMaterials,
} from '@/lib/agent/materials';

/**
 * StudyBuddy MCP server (protocol revision 2026-07-28).
 *
 * Built once per HTTP request by createMcpHandler (see app/api/mcp/route.ts).
 * The protocol is stateless, so every tool is scoped to the userId resolved
 * from that request's API key — there is no session to carry it.
 */

const SERVER_INSTRUCTIONS = `StudyBuddy gives access to the user's course materials: lecture transcripts and uploaded slides/PDFs.

Workflow:
1. Call list_courses to get course IDs.
2. If the question is about a specific lecture or document, call list_lectures or list_documents and pass its ID to search_materials.
3. Call search_materials with a focused query.

Cite each result's "source" in answers, and include the "link" for lecture results (it opens the video at that timestamp).`;

const courseIdSchema = z
  .string()
  .min(1)
  .describe('Course ID from list_courses');

function ok<T extends Record<string, unknown>>(data: T): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
    structuredContent: data,
  };
}

function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function createStudyBuddyMcpServer(userId: string): McpServer {
  const server = new McpServer(
    { name: 'studybuddy', title: 'StudyBuddy', version: '1.0.0' },
    { instructions: SERVER_INSTRUCTIONS }
  );

  // Registration order is the tools/list order (spec: SHOULD be deterministic).
  server.registerTool(
    'list_courses',
    {
      title: 'List courses',
      description: "List the courses the user is enrolled in. Call this first to get course IDs.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        courses: z.array(
          z.object({
            id: z.string(),
            code: z.string(),
            title: z.string(),
            instructor: z.string().nullable(),
          })
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async () => ok({ courses: await listEnrolledCourses(userId) })
  );

  server.registerTool(
    'list_lectures',
    {
      title: 'List lectures',
      description: 'List recorded lectures the user has access to in a course, newest first.',
      inputSchema: z.object({ courseId: courseIdSchema }),
      outputSchema: z.object({
        lectures: z.array(
          z.object({
            id: z.string(),
            title: z.string().nullable(),
            durationSeconds: z.number().nullable(),
            status: z.string(),
            createdAt: z.string().optional(),
          })
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ courseId }) =>
      ok({ lectures: await listCourseLectures(userId, courseId) })
  );

  server.registerTool(
    'list_documents',
    {
      title: 'List documents',
      description: 'List slides/PDFs the user has uploaded to a course, newest first.',
      inputSchema: z.object({ courseId: courseIdSchema }),
      outputSchema: z.object({
        documents: z.array(
          z.object({
            id: z.string(),
            filename: z.string(),
            pageCount: z.number().nullable(),
            status: z.string(),
            createdAt: z.string(),
          })
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ courseId }) =>
      ok({ documents: await listCourseDocuments(userId, courseId) })
  );

  server.registerTool(
    'search_materials',
    {
      title: 'Search course materials',
      description:
        'Semantic search over a course\'s lecture transcripts and slides. Returns at most 5 lecture chunks and 5 slide chunks. ' +
        'Pass lectureId or documentId to restrict results to one source when the user asks about a specific lecture or document.',
      inputSchema: z.object({
        courseId: courseIdSchema,
        query: z.string().min(1).describe('What to look for, phrased as a focused search query'),
        lectureId: z.string().optional().describe('Restrict to one lecture (ID from list_lectures)'),
        documentId: z.string().optional().describe('Restrict to one document (ID from list_documents)'),
      }),
      outputSchema: z.object({
        results: z.array(
          z.object({
            content: z.string(),
            source: z.string(),
            type: z.enum(['lecture', 'slide']),
            link: z.string().optional(),
          })
        ),
      }),
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    async ({ courseId, query, lectureId, documentId }) => {
      if (!(await isEnrolled(userId, courseId))) {
        return toolError(
          `Not enrolled in course ${courseId}. Call list_courses to see valid course IDs.`
        );
      }

      const results = await searchCourseMaterials({
        userId,
        courseId,
        query,
        lectureId,
        documentId,
      });
      return ok({ results });
    }
  );

  return server;
}
