import { auth } from '@clerk/nextjs/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  streamText,
  tool,
  convertToModelMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { db, chatSessions, chatMessages } from '@/lib/db';
import { searchKnowledge, SYSTEM_PROMPT } from '@/lib/ai';
import { getUserApiKey } from '@/lib/api-keys';
import { saveSourcesWithDedup } from '@/lib/sources/deduplicated-sources';
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

  // Get user's API key (BYOK required)
  let apiKey: string;
  try {
    apiKey = await getUserApiKey(userId);
  } catch {
    return Response.json(
      {
        error: 'API key required',
        code: 'NO_API_KEY',
        message: 'Please connect your OpenRouter API key to use chat.'
      },
      { status: 402 }
    );
  }

  const openrouter = createOpenRouter({
    apiKey,
  });

  const modelMessages = await convertToModelMessages(messages);

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openrouter.chat('deepseek/deepseek-v3.2'),
        system: SYSTEM_PROMPT,
        messages: modelMessages,
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
                apiKey,
              });
              collectedSources = sources;

              // Stream sources to frontend immediately after RAG retrieval
              for (const source of sources) {
                writer.write({
                  type: 'data-rag-source',
                  data: source,
                });
              }

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

          // Save sources with deduplication at course level
          if (collectedSources.length > 0 && savedAssistantMsg) {
            try {
              console.log(`[Chat] Saving ${collectedSources.length} sources for message ${savedAssistantMsg.id}`);
              await saveSourcesWithDedup(
                collectedSources,
                savedAssistantMsg.id,
                sessionId,
                courseId
              );
              console.log(`[Chat] Sources saved successfully`);
            } catch (err) {
              console.error(`[Chat] Failed to save sources:`, err);
            }
          }

          // Update session timestamp
          await db
            .update(chatSessions)
            .set({ updatedAt: new Date() })
            .where(eq(chatSessions.id, sessionId));
        },
      });

      // Merge the LLM stream into the UI message stream
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
