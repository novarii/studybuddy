import { auth } from '@clerk/nextjs/server';
import { eq, and, asc } from 'drizzle-orm';
import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

import { db, chatSessions, chatMessages } from '@/lib/db';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';

// Let OpenRouter pick the best model for the task
const TITLE_MODEL = 'openrouter/auto';

const TITLE_SYSTEM_PROMPT = `You are a helpful assistant that generates concise chat titles.
Given a conversation exchange, generate a short, descriptive title (max 50 characters).
The title should capture the main topic or question being discussed.
Respond with ONLY the title, no quotes, no explanation.`;

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: Request, { params }: RouteParams) {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id: sessionId } = await params;

  // Verify session exists and belongs to user
  const session = await db.query.chatSessions.findFirst({
    where: and(
      eq(chatSessions.id, sessionId),
      eq(chatSessions.userId, userId)
    ),
  });

  if (!session) {
    return Response.json({ error: 'Session not found' }, { status: 404 });
  }

  // Get messages to generate title from
  const messages = await db.query.chatMessages.findMany({
    where: eq(chatMessages.sessionId, sessionId),
    orderBy: [asc(chatMessages.createdAt)],
    limit: 2, // Only need first exchange
  });

  if (messages.length === 0) {
    return Response.json({ title: null });
  }

  // Get first user message and first assistant response
  const firstUserMessage = messages.find((msg) => msg.role === 'user');
  const firstAssistantMessage = messages.find((msg) => msg.role === 'assistant');

  if (!firstUserMessage) {
    return Response.json({ title: null });
  }

  let title: string;

  try {
    // Get user's API key (or shared fallback)
    const apiKey = await getUserApiKey(userId);
    const openrouter = createOpenRouter({ apiKey });

    // Build prompt with conversation context
    const conversationContext = firstAssistantMessage
      ? `User: ${firstUserMessage.content.slice(0, 500)}\n\nAssistant: ${firstAssistantMessage.content.slice(0, 500)}`
      : `User: ${firstUserMessage.content.slice(0, 500)}`;

    const result = await generateText({
      model: openrouter(TITLE_MODEL),
      system: TITLE_SYSTEM_PROMPT,
      prompt: conversationContext,
    });

    // Clean up and truncate the generated title
    title = result.text.trim().replace(/^["']|["']$/g, ''); // Remove quotes if any
    if (title.length > 50) {
      title = title.slice(0, 47) + '...';
    }
  } catch (error) {
    console.error('Failed to generate title with LLM, using fallback:', error);
    // Fallback: truncate first user message
    title = firstUserMessage.content.slice(0, 50);
    if (firstUserMessage.content.length > 50) {
      title = title.slice(0, 47) + '...';
    }
  }

  // Update session with generated title
  const [updatedSession] = await db
    .update(chatSessions)
    .set({ title, updatedAt: new Date() })
    .where(eq(chatSessions.id, sessionId))
    .returning();

  return Response.json({ title: updatedSession.title });
}
