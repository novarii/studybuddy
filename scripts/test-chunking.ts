import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { generateObject } from 'ai';
import { z } from 'zod';
import { readFileSync, writeFileSync } from 'fs';
import { config } from 'dotenv';

// Load .env.local
config({ path: '.env.local' });

const CHUNKING_MODEL = 'google/gemini-2.5-flash-lite';

const SemanticChunksSchema = z.object({
  chunks: z.array(
    z.object({
      title: z.string().describe('Brief topic title (3-6 words)'),
      text: z.string().describe('The verbatim transcript text for this topic'),
    })
  ),
});

const CHUNKING_SYSTEM_PROMPT = `You are analyzing a lecture transcript to identify topic boundaries.

Split the transcript into logical chunks where each chunk covers ONE topic or concept.
Return the chunks with:
- title: A brief 3-6 word title for the topic
- text: Copy the EXACT verbatim text from the transcript for this chunk (do not paraphrase or summarize)

Important:
- Each chunk should be a coherent topic (not arbitrary time splits)
- The text field MUST contain the exact words from the transcript, not a summary
- Typical chunk length: 1-5 minutes of content
- Look for topic transitions: "Now let's talk about...", "Moving on to...", etc.
- If the transcript is short, it's okay to return just one chunk`;

async function main() {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not set');
  }

  const transcript = readFileSync('sample_lecture.txt', 'utf-8');
  console.log('Transcript length:', transcript.length, 'chars');

  const openrouter = createOpenRouter({ apiKey });

  console.log('Sending to LLM...');
  const result = await generateObject({
    model: openrouter(CHUNKING_MODEL),
    schema: SemanticChunksSchema,
    system: CHUNKING_SYSTEM_PROMPT,
    prompt: transcript,
  });

  console.log('\n=== LLM RESPONSE ===');
  console.log('Number of chunks:', result.object.chunks.length);

  const output = result.object.chunks
    .map((chunk, i) => {
      return `
================================================================================
CHUNK ${i}: ${chunk.title}
================================================================================
${chunk.text}
`;
    })
    .join('\n');

  writeFileSync('llm_chunking_test_output.txt', output);
  console.log('\nWritten to llm_chunking_test_output.txt');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
