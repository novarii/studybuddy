import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

const COMPACTION_THRESHOLD = 131_000;
const COMPACTION_MINIMUM = 50_000;
const MESSAGES_TO_KEEP = 8;

function buildCompactionPrompt(courseCode: string, courseTitle: string): string {
  return `Summarize the following conversation between a student and StudyBuddy (an AI study assistant for the course "${courseCode} - ${courseTitle}").

Preserve:
- Key topics and concepts discussed
- Questions the student asked and the answers given
- Any specific course material referenced (lecture topics, slide content)
- The current thread of discussion and any unresolved questions
- Important context the assistant would need to continue helping naturally

Be concise but thorough. The assistant will use this summary as context to continue the conversation.`;
}

/**
 * Check whether a session needs compaction based on its last prompt token count.
 */
export function shouldCompact(lastPromptTokens: number | null): boolean {
  if (lastPromptTokens == null) return false;
  if (lastPromptTokens < COMPACTION_MINIMUM) return false;
  return lastPromptTokens > COMPACTION_THRESHOLD;
}

/**
 * Format a summary as a system message to prepend to the LLM context.
 */
export function buildSummarySystemMessage(summary: string): string {
  return `[Previous conversation summary]\n${summary}\n[End of summary — continue the conversation naturally]`;
}

interface CompactionInput {
  /** All DB messages for the session, ordered by createdAt asc */
  dbMessages: Array<{ id: string; role: string; content: string; createdAt: Date }>;
  /** Existing summary from a prior compaction (if any) */
  existingSummary: string | null;
  courseCode: string;
  courseTitle: string;
  apiKey: string;
}

interface CompactionResult {
  summary: string;
  /** Messages after this ID are kept in full; messages before are covered by the summary */
  compactedBeforeMessageId: string;
}

/**
 * Generate a compacted summary of older messages, keeping the last N intact.
 */
export async function compactMessages({
  dbMessages,
  existingSummary,
  courseCode,
  courseTitle,
  apiKey,
}: CompactionInput): Promise<CompactionResult> {
  if (dbMessages.length <= MESSAGES_TO_KEEP) {
    throw new Error('Not enough messages to compact');
  }

  // Split: older messages to summarize, recent messages to keep
  const cutoffIndex = dbMessages.length - MESSAGES_TO_KEEP;
  const messagesToSummarize = dbMessages.slice(0, cutoffIndex);
  const compactedBeforeMessageId = dbMessages[cutoffIndex].id;

  // Build the conversation text to summarize
  let conversationText = '';

  if (existingSummary) {
    conversationText += `[Prior summary]\n${existingSummary}\n[End prior summary]\n\n`;
  }

  for (const msg of messagesToSummarize) {
    const role = msg.role === 'user' ? 'Student' : 'StudyBuddy';
    conversationText += `${role}: ${msg.content}\n\n`;
  }

  const openrouter = createOpenRouter({ apiKey });

  const result = await generateText({
    model: openrouter.chat('x-ai/grok-4.1-fast'),
    system: buildCompactionPrompt(courseCode, courseTitle),
    prompt: conversationText,
  });

  return {
    summary: result.text,
    compactedBeforeMessageId,
  };
}
