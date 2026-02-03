import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Mock the gemini-extractor module
vi.mock('@/lib/documents/gemini-extractor', () => ({
  extractPageContent: vi.fn(),
}));

import { extractPageContent } from '@/lib/documents/gemini-extractor';
import {
  processPages,
  processPageWithRetry,
  CONCURRENCY_LIMIT,
  MAX_RETRIES,
  type PageResult,
} from '@/lib/documents/page-processor';

describe('processPages', () => {
  const mockApiKey = 'test-api-key';
  const createMockPage = (index: number): Uint8Array => {
    const bytes = new Uint8Array(100);
    bytes[0] = index;
    return bytes;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should process all pages and return results', async () => {
    const pages = [createMockPage(0), createMockPage(1), createMockPage(2)];

    (extractPageContent as Mock).mockImplementation(async (bytes: Uint8Array) => {
      return `Content for page ${bytes[0]}`;
    });

    const promise = processPages(pages, mockApiKey);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(3);
    expect(results[0]).toEqual({
      pageNumber: 0,
      content: 'Content for page 0',
      success: true,
    });
    expect(results[1]).toEqual({
      pageNumber: 1,
      content: 'Content for page 1',
      success: true,
    });
    expect(results[2]).toEqual({
      pageNumber: 2,
      content: 'Content for page 2',
      success: true,
    });
  });

  it('should maintain page order in results', async () => {
    const pages = [createMockPage(0), createMockPage(1), createMockPage(2), createMockPage(3)];

    // Make later pages return first to test ordering
    (extractPageContent as Mock).mockImplementation(async (bytes: Uint8Array) => {
      const delay = (3 - bytes[0]) * 10; // Reverse order timing
      await new Promise((r) => setTimeout(r, delay));
      return `Content ${bytes[0]}`;
    });

    const promise = processPages(pages, mockApiKey);
    await vi.runAllTimersAsync();
    const results = await promise;

    // Results should be in original page order
    expect(results.map((r) => r.pageNumber)).toEqual([0, 1, 2, 3]);
  });

  it('should handle empty pages array', async () => {
    const results = await processPages([], mockApiKey);

    expect(results).toEqual([]);
    expect(extractPageContent).not.toHaveBeenCalled();
  });

  it('should handle single page', async () => {
    const pages = [createMockPage(0)];

    (extractPageContent as Mock).mockResolvedValue('Single page content');

    const promise = processPages(pages, mockApiKey);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results).toHaveLength(1);
    expect(results[0].content).toBe('Single page content');
  });

  it('should mark failed pages with success: false', async () => {
    const pages = [createMockPage(0), createMockPage(1)];

    (extractPageContent as Mock)
      .mockResolvedValueOnce('Content 0')
      .mockRejectedValueOnce(new Error('API error'))
      .mockRejectedValueOnce(new Error('API error')); // For retry

    const promise = processPages(pages, mockApiKey);
    await vi.runAllTimersAsync();
    const results = await promise;

    expect(results[0].success).toBe(true);
    expect(results[1].success).toBe(false);
    expect(results[1].content).toBeNull();
    expect(results[1].error).toBeDefined();
  });

  it('should pass correct API key to extractPageContent', async () => {
    const pages = [createMockPage(0)];
    const customApiKey = 'custom-user-api-key';

    (extractPageContent as Mock).mockResolvedValue('Content');

    const promise = processPages(pages, customApiKey);
    await vi.runAllTimersAsync();
    await promise;

    expect(extractPageContent).toHaveBeenCalledWith(pages[0], customApiKey);
  });

  it('should respect concurrency limit', async () => {
    // Create more pages than concurrency limit
    const pageCount = CONCURRENCY_LIMIT + 3;
    const pages = Array.from({ length: pageCount }, (_, i) => createMockPage(i));

    let concurrentCalls = 0;
    let maxConcurrentCalls = 0;

    (extractPageContent as Mock).mockImplementation(async () => {
      concurrentCalls++;
      maxConcurrentCalls = Math.max(maxConcurrentCalls, concurrentCalls);
      await new Promise((r) => setTimeout(r, 50));
      concurrentCalls--;
      return 'Content';
    });

    const promise = processPages(pages, mockApiKey);
    await vi.runAllTimersAsync();
    await promise;

    expect(maxConcurrentCalls).toBeLessThanOrEqual(CONCURRENCY_LIMIT);
  });

  it('should export correct constants', () => {
    expect(CONCURRENCY_LIMIT).toBe(5);
    expect(MAX_RETRIES).toBe(1);
  });
});

describe('processPageWithRetry', () => {
  const mockApiKey = 'test-api-key';
  const mockPageBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return success result on first attempt success', async () => {
    (extractPageContent as Mock).mockResolvedValue('Extracted content');

    const promise = processPageWithRetry(mockPageBytes, 0, mockApiKey);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result).toEqual({
      pageNumber: 0,
      content: 'Extracted content',
      success: true,
    });
    expect(extractPageContent).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on second attempt', async () => {
    (extractPageContent as Mock)
      .mockRejectedValueOnce(new Error('Temporary error'))
      .mockResolvedValueOnce('Success on retry');

    const promise = processPageWithRetry(mockPageBytes, 1, mockApiKey);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.content).toBe('Success on retry');
    expect(extractPageContent).toHaveBeenCalledTimes(2);
  });

  it('should return failure result after all retries exhausted', async () => {
    const error = new Error('Persistent error');
    (extractPageContent as Mock).mockRejectedValue(error);

    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = processPageWithRetry(mockPageBytes, 2, mockApiKey);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.content).toBeNull();
    expect(result.error).toBe(error);
    expect(result.pageNumber).toBe(2);
    expect(extractPageContent).toHaveBeenCalledTimes(MAX_RETRIES + 1);

    consoleSpy.mockRestore();
  });

  it('should wait before retry', async () => {
    (extractPageContent as Mock)
      .mockRejectedValueOnce(new Error('Error'))
      .mockResolvedValueOnce('Success');

    const promise = processPageWithRetry(mockPageBytes, 0, mockApiKey);

    // First call happens immediately
    expect(extractPageContent).toHaveBeenCalledTimes(1);

    // Advance time for retry delay
    await vi.advanceTimersByTimeAsync(1000);

    await promise;

    // Second call should happen after delay
    expect(extractPageContent).toHaveBeenCalledTimes(2);
  });

  it('should log error on final failure', async () => {
    const error = new Error('Final error');
    (extractPageContent as Mock).mockRejectedValue(error);

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = processPageWithRetry(mockPageBytes, 5, mockApiKey);
    await vi.runAllTimersAsync();
    await promise;

    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain('Page 5 failed');

    consoleSpy.mockRestore();
  });

  it('should include correct page number in result', async () => {
    (extractPageContent as Mock).mockResolvedValue('Content');

    const promise = processPageWithRetry(mockPageBytes, 42, mockApiKey);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.pageNumber).toBe(42);
  });

  it('should handle non-Error exceptions', async () => {
    (extractPageContent as Mock).mockRejectedValue('String error');

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const promise = processPageWithRetry(mockPageBytes, 0, mockApiKey);
    await vi.runAllTimersAsync();
    const result = await promise;

    expect(result.success).toBe(false);
    expect(result.error).toBe('String error');

    consoleSpy.mockRestore();
  });
});

describe('PageResult type', () => {
  it('should allow successful result structure', () => {
    const successResult: PageResult = {
      pageNumber: 0,
      content: 'Some content',
      success: true,
    };

    expect(successResult.success).toBe(true);
    expect(successResult.content).toBe('Some content');
    expect(successResult.error).toBeUndefined();
  });

  it('should allow failed result structure', () => {
    const failedResult: PageResult = {
      pageNumber: 1,
      content: null,
      success: false,
      error: new Error('Failed'),
    };

    expect(failedResult.success).toBe(false);
    expect(failedResult.content).toBeNull();
    expect(failedResult.error).toBeDefined();
  });
});
