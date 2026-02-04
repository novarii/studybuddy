import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';

/**
 * Model used for PDF page extraction via OpenRouter.
 * Gemini 2.5 Flash Lite supports native PDF input.
 */
const EXTRACTION_MODEL = 'google/gemini-2.5-flash-lite';

/**
 * Extraction prompt for extracting content from PDF slides/pages.
 * This is a placeholder prompt that can be customized by the user.
 */
export const EXTRACTION_PROMPT = `Extract all text content from this PDF page.

Include:
- All visible text (headings, paragraphs, bullet points, captions)
- Text from diagrams, charts, or figures (describe what they show)
- Any code snippets or formulas

Format the output as clean, readable text. Preserve the logical structure and hierarchy of the content.`;

/**
 * Extract content from a single PDF page using Gemini via OpenRouter.
 *
 * @param pageBytes - The PDF page as a Uint8Array (single-page PDF)
 * @param apiKey - OpenRouter API key (user's BYOK key or shared key)
 * @returns The extracted text content from the page
 * @throws Error if the API call fails
 */
export async function extractPageContent(
  pageBytes: Uint8Array,
  apiKey: string
): Promise<string> {
  const openrouter = createOpenRouter({ apiKey });

  const result = await generateText({
    model: openrouter(EXTRACTION_MODEL),
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: EXTRACTION_PROMPT },
          {
            type: 'file',
            data: pageBytes,
            mediaType: 'application/pdf',
          },
        ],
      },
    ],
  });

  return result.text;
}
