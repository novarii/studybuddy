import { auth } from '@clerk/nextjs/server';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import {
  streamText,
  tool,
  convertToModelMessages,
  pruneMessages,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessage,
} from 'ai';
import { z } from 'zod';
import { eq, and } from 'drizzle-orm';

import { db, chatSessions, chatMessages, courses } from '@/lib/db';
import {
  searchKnowledge,
  SYSTEM_PROMPT,
  shouldCompact,
  buildSummarySystemMessage,
  compactMessages,
} from '@/lib/ai';
import { getUserApiKey } from '@/lib/api-keys';
import { saveSourcesWithDedup } from '@/lib/sources/deduplicated-sources';
import type { RAGSource } from '@/types';

export const maxDuration = 300;

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

  // Look up course info for system prompt context
  const course = await db.query.courses.findFirst({
    where: eq(courses.id, courseId),
  });

  const systemPrompt = course
    ? `${SYSTEM_PROMPT}\n\nYou are currently helping with the course: "${course.code} - ${course.title}"${course.instructor ? ` (Instructor: ${course.instructor})` : ''}.`
    : SYSTEM_PROMPT;

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

  // --- Context compaction ---
  // If session already has a summary from prior compaction, prepend it to system prompt
  let effectiveSystemPrompt = systemPrompt;
  let compactedBeforeMessageId = session.compactedBeforeMessageId;

  if (session.summary && compactedBeforeMessageId) {
    effectiveSystemPrompt = `${systemPrompt}\n\n${buildSummarySystemMessage(session.summary)}`;
  }

  // Check if we need to trigger compaction on this request
  let pendingCompaction: { summary: string; compactedBeforeMessageId: string } | null = null;

  if (shouldCompact(session.lastPromptTokens)) {
    const dbMessages = await db.query.chatMessages.findMany({
      where: eq(chatMessages.sessionId, sessionId),
      orderBy: (m, { asc }) => [asc(m.createdAt)],
    });

    if (dbMessages.length > 8) {
      try {
        console.log(
          `[Chat] Compacting session ${sessionId} (promptTokens: ${session.lastPromptTokens})`
        );
        const compactionResult = await compactMessages({
          dbMessages,
          existingSummary: session.summary,
          courseCode: course?.code ?? 'Unknown',
          courseTitle: course?.title ?? 'Unknown',
          apiKey,
        });
        console.log(
          `[Chat] Compaction complete, summary: ${compactionResult.summary.length} chars`
        );

        pendingCompaction = compactionResult;
        compactedBeforeMessageId = compactionResult.compactedBeforeMessageId;

        // Apply the new summary to this request immediately
        effectiveSystemPrompt = `${systemPrompt}\n\n${buildSummarySystemMessage(compactionResult.summary)}`;
      } catch (err) {
        console.error(`[Chat] Compaction failed, continuing with full context:`, err);
      }
    }
  }

  // Build model messages, filtering out compacted messages if we have a boundary
  let convertedMessages = await convertToModelMessages(messages);

  if (compactedBeforeMessageId) {
    // Find the boundary in frontend messages — messages are ordered chronologically.
    // The frontend sends UIMessages with `id` fields that match DB message IDs.
    // Find the index of the compaction boundary message and keep only messages from that point.
    const boundaryIndex = messages.findIndex(
      (m) => m.id === compactedBeforeMessageId
    );
    if (boundaryIndex > 0) {
      convertedMessages = await convertToModelMessages(
        messages.slice(boundaryIndex)
      );
    }
  }

  const modelMessages = pruneMessages({
    messages: convertedMessages,
    toolCalls: 'before-last-8-messages',
    emptyMessages: 'remove',
  });

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      const result = streamText({
        model: openrouter.chat('deepseek/deepseek-v3.2', {
          usage: { include: true },
        }),
        system: effectiveSystemPrompt,
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
              collectedSources.push(...sources);

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
        onFinish: async ({ response, usage, providerMetadata }) => {
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

          // Save sources — consumeStream() guarantees onFinish fires even
          // if the client disconnects, so this always runs
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

          // Track token usage and persist compaction/session metadata
          const promptTokens = usage?.inputTokens
            ?? (providerMetadata?.openrouter as { usage?: { promptTokens?: number } })?.usage?.promptTokens;

          if (promptTokens) {
            console.log(`[Chat] Session ${sessionId}: ${promptTokens} prompt tokens`);
          }

          await db
            .update(chatSessions)
            .set({
              updatedAt: new Date(),
              ...(promptTokens ? { lastPromptTokens: promptTokens } : {}),
              ...(pendingCompaction
                ? {
                    summary: pendingCompaction.summary,
                    compactedAt: new Date(),
                    compactedBeforeMessageId:
                      pendingCompaction.compactedBeforeMessageId,
                  }
                : {}),
            })
            .where(eq(chatSessions.id, sessionId));
        },
      });

      // Consume the stream server-side so onFinish fires even if the
      // client disconnects (e.g. user switches sessions mid-response)
      result.consumeStream();

      // Merge the LLM stream into the UI message stream
      writer.merge(result.toUIMessageStream());
    },
  });

  return createUIMessageStreamResponse({ stream });
}
