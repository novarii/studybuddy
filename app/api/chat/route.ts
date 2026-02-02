import { auth } from '@clerk/nextjs/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { db, chatSessions, chatMessages, messageSources } from '@/lib/db';
import { searchKnowledge, SYSTEM_PROMPT } from '@/lib/ai';
import type { RAGSource } from '@/types';

export const maxDuration = 60;

interface ChatRequestBody {
  messages: UIMessage[];
  sessionId: string;
  courseId: string;
  documentId?: string;
  lectureId?: string;
}

export async function POST(req: Request) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body: ChatRequestBody = await req.json();
  const { messages, sessionId, courseId, documentId, lectureId } = body;

  if (!sessionId) {
    return Response.json({ error: 'sessionId is required' }, { status: 400 });
  }

  if (!courseId) {
    return Response.json({ error: 'courseId is required' }, { status: 400 });
  }

  if (!messages || messages.length === 0) {
    return Response.json(
      { error: 'messages array is required' },
      { status: 400 }
    );
  }

  // Verify session ownership
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId)
    ),
  });

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Extract text from the last user message
  const lastMessage = messages[messages.length - 1];
  const userMessageText =
    lastMessage?.parts
      ?.filter(
        (part): part is { type: 'text'; text: string } => part.type === 'text'
      )
      .map((part) => part.text)
      .join('') || '';

  // Save user message to database
  await db.insert(chatMessages).values({
    sessionId,
    role: 'user',
    content: userMessageText,
  });

  // Collected sources during tool execution
  let collectedSources: RAGSource[] = [];

  const openrouter = createOpenRouter({
    apiKey: process.env.OPENROUTER_API_KEY,
  });

  const result = streamText({
    model: openrouter.chat('anthropic/claude-sonnet-4'),
    system: SYSTEM_PROMPT,
    messages: await convertToModelMessages(messages),
    tools: {
      search_course_materials: tool({
        description:
          'Search lecture transcripts and slide content for relevant information about course topics',
        inputSchema: z.object({
          query: z
            .string()
            .describe('The search query to find relevant course materials'),
        }),
        execute: async ({ query }) => {
          const { context, sources } = await searchKnowledge({
            query,
            userId,
            courseId,
            documentId,
            lectureId,
          });
          collectedSources = sources;
          return context;
        },
      }),
    },
    stopWhen: stepCountIs(3),
    onFinish: async ({ response }) => {
      // Extract text content from all assistant messages
      const assistantContent = response.messages
        .filter((m) => m.role === 'assistant')
        .map((m) => {
          // Content can be a string or an array of parts
          if (typeof m.content === 'string') {
            return m.content;
          }
          return m.content
            .filter(
              (c): c is { type: 'text'; text: string } =>
                typeof c === 'object' && c.type === 'text'
            )
            .map((c) => c.text)
            .join('');
        })
        .join('');

      // Save assistant message to database
      const [savedAssistantMsg] = await db
        .insert(chatMessages)
        .values({
          sessionId,
          role: 'assistant',
          content: assistantContent,
        })
        .returning();

      // Save sources if any were collected
      if (collectedSources.length > 0 && savedAssistantMsg) {
        await db.insert(messageSources).values(
          collectedSources.map((source) => ({
            messageId: savedAssistantMsg.id,
            sessionId,
            sourceId: source.source_id,
            sourceType: source.source_type,
            chunkNumber: source.chunk_number,
            contentPreview: source.content_preview,
            documentId: source.document_id,
            slideNumber: source.slide_number,
            lectureId: source.lecture_id,
            startSeconds: source.start_seconds,
            endSeconds: source.end_seconds,
            courseId: source.course_id,
            ownerId: userId,
            title: source.title,
          }))
        );
      }

      // Update session timestamp
      await db
        .update(chatSessions)
        .set({ updatedAt: new Date() })
        .where(eq(chatSessions.id, sessionId));
    },
  });

  // Consume stream to ensure it completes even if client disconnects
  result.consumeStream();

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  });
}
