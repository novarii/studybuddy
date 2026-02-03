import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Mock the AI SDK and OpenRouter provider
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(),
}));

import { generateText } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { extractPageContent, EXTRACTION_PROMPT } from '@/lib/documents/gemini-extractor';

describe('extractPageContent', () => {
  const mockApiKey = 'test-api-key-12345';
  const mockPageBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes
  const mockExtractedText = 'This is the extracted content from the PDF page.';

  // Track mock instances for verification
  const mockModelInstance = { _type: 'mock-gemini-model' };
  let mockOpenRouterFn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup mock OpenRouter provider that returns a trackable model instance
    mockOpenRouterFn = vi.fn().mockReturnValue(mockModelInstance);
    (createOpenRouter as Mock).mockReturnValue(mockOpenRouterFn);

    // Setup mock generateText response
    (generateText as Mock).mockResolvedValue({
      text: mockExtractedText,
      usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150 },
      finishReason: 'stop',
    });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should call createOpenRouter with the provided API key', async () => {
    await extractPageContent(mockPageBytes, mockApiKey);

    expect(createOpenRouter).toHaveBeenCalledTimes(1);
    expect(createOpenRouter).toHaveBeenCalledWith({ apiKey: mockApiKey });
  });

  it('should call generateText with correct model and message format', async () => {
    await extractPageContent(mockPageBytes, mockApiKey);

    expect(generateText).toHaveBeenCalledTimes(1);
    const call = (generateText as Mock).mock.calls[0][0];

    // Verify model instance is passed correctly
    expect(call.model).toBe(mockModelInstance);

    // Verify messages structure
    expect(call.messages).toHaveLength(1);
    expect(call.messages[0].role).toBe('user');
    expect(call.messages[0].content).toBeInstanceOf(Array);
    expect(call.messages[0].content).toHaveLength(2);
  });

  it('should include text prompt and PDF file in message content', async () => {
    await extractPageContent(mockPageBytes, mockApiKey);

    const call = (generateText as Mock).mock.calls[0][0];
    const content = call.messages[0].content;

    // First part should be text prompt
    expect(content[0].type).toBe('text');
    expect(content[0].text).toBe(EXTRACTION_PROMPT);

    // Second part should be the PDF file
    expect(content[1].type).toBe('file');
    expect(content[1].data).toEqual(mockPageBytes);
    expect(content[1].mediaType).toBe('application/pdf');
  });

  it('should return the extracted text from the response', async () => {
    const result = await extractPageContent(mockPageBytes, mockApiKey);

    expect(result).toBe(mockExtractedText);
  });

  it('should handle empty response text', async () => {
    (generateText as Mock).mockResolvedValueOnce({
      text: '',
      usage: { promptTokens: 100, completionTokens: 0, totalTokens: 100 },
      finishReason: 'stop',
    });

    const result = await extractPageContent(mockPageBytes, mockApiKey);

    expect(result).toBe('');
  });

  it('should propagate errors from generateText', async () => {
    const error = new Error('API rate limit exceeded');
    (generateText as Mock).mockRejectedValueOnce(error);

    await expect(extractPageContent(mockPageBytes, mockApiKey)).rejects.toThrow(
      'API rate limit exceeded'
    );
  });

  it('should use the correct Gemini model via OpenRouter', async () => {
    await extractPageContent(mockPageBytes, mockApiKey);

    // Verify the openrouter function was called with the correct model name
    expect(mockOpenRouterFn).toHaveBeenCalledWith('google/gemini-2.5-flash-lite');
  });

  it('should handle large page bytes', async () => {
    // Create a larger mock PDF (1MB)
    const largePageBytes = new Uint8Array(1024 * 1024);
    largePageBytes[0] = 0x25; // %
    largePageBytes[1] = 0x50; // P
    largePageBytes[2] = 0x44; // D
    largePageBytes[3] = 0x46; // F

    const result = await extractPageContent(largePageBytes, mockApiKey);

    expect(result).toBe(mockExtractedText);

    const call = (generateText as Mock).mock.calls[0][0];
    const fileContent = call.messages[0].content[1];
    expect(fileContent.data.length).toBe(1024 * 1024);
  });

  it('should include extraction prompt that requests content extraction', () => {
    // Verify the extraction prompt is defined and meaningful
    expect(EXTRACTION_PROMPT).toBeDefined();
    expect(typeof EXTRACTION_PROMPT).toBe('string');
    expect(EXTRACTION_PROMPT.length).toBeGreaterThan(0);
  });
});

describe('EXTRACTION_PROMPT', () => {
  it('should be a non-empty string', () => {
    expect(typeof EXTRACTION_PROMPT).toBe('string');
    expect(EXTRACTION_PROMPT.trim().length).toBeGreaterThan(0);
  });
});
