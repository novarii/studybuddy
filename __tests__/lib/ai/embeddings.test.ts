import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { embed } from '@/lib/ai/embeddings';

describe('embed', () => {
  const originalFetch = global.fetch;
  const mockFetch = vi.fn();

  beforeEach(() => {
    global.fetch = mockFetch;
    vi.stubEnv('OPENROUTER_API_KEY', 'test-api-key');
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllEnvs();
    mockFetch.mockReset();
  });

  it('calls OpenRouter with correct model and input', async () => {
    const mockEmbedding = Array(1536).fill(0.1);
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockEmbedding, index: 0 }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 10, total_tokens: 10 },
      }),
    } as Response);

    await embed('test query');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer test-api-key',
        }),
      })
    );

    // Verify request body
    const call = mockFetch.mock.calls[0];
    const body = JSON.parse(call[1].body);
    expect(body.model).toBe('openai/text-embedding-3-small');
    expect(body.input).toBe('test query');
  });

  it('returns embedding array from response', async () => {
    const mockEmbedding = [0.1, 0.2, 0.3, 0.4, 0.5];
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: mockEmbedding, index: 0 }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 5, total_tokens: 5 },
      }),
    } as Response);

    const result = await embed('test');

    expect(result).toEqual(mockEmbedding);
  });

  it('uses provided API key when given', async () => {
    const customKey = 'user-provided-key';
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1], index: 0 }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 1, total_tokens: 1 },
      }),
    } as Response);

    await embed('test query', customKey);

    const call = mockFetch.mock.calls[0];
    expect(call[1].headers.Authorization).toBe(`Bearer ${customKey}`);
  });

  it('throws error when API response is not ok', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
    } as Response);

    await expect(embed('test')).rejects.toThrow('Embedding failed: Unauthorized');
  });

  it('throws error when no API key is available', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');

    await expect(embed('test')).rejects.toThrow('No API key provided');
  });

  it('handles empty input gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.0], index: 0 }],
        model: 'openai/text-embedding-3-small',
        usage: { prompt_tokens: 0, total_tokens: 0 },
      }),
    } as Response);

    const result = await embed('');

    expect(result).toEqual([0.0]);
  });
});
