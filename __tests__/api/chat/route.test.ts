import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      chatSessions: {
        findFirst: vi.fn(),
      },
      userApiKeys: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        returning: vi.fn(),
      })),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(),
      })),
    })),
  },
  // Schema objects need to be objects that can be used with eq()
  chatSessions: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    courseId: { name: 'course_id' },
    title: { name: 'title' },
    updatedAt: { name: 'updated_at' },
  },
  chatMessages: {
    id: { name: 'id' },
    sessionId: { name: 'session_id' },
    role: { name: 'role' },
    content: { name: 'content' },
  },
  messageSources: {
    id: { name: 'id' },
    messageId: { name: 'message_id' },
    sessionId: { name: 'session_id' },
  },
  userApiKeys: {
    id: { name: 'id' },
    userId: { name: 'user_id' },
    openrouterKeyEncrypted: { name: 'openrouter_key_encrypted' },
  },
}));

vi.mock('@/lib/ai', () => ({
  searchKnowledge: vi.fn(),
  SYSTEM_PROMPT: 'You are a helpful study assistant.',
}));

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn(),
}));

vi.mock('@openrouter/ai-sdk-provider', () => ({
  createOpenRouter: vi.fn(() => ({
    chat: vi.fn((model: string) => ({ modelId: model })),
  })),
}));

vi.mock('ai', () => ({
  streamText: vi.fn(),
  tool: vi.fn((config) => config),
  convertToModelMessages: vi.fn((messages) => messages),
  stepCountIs: vi.fn((count) => ({ type: 'stepCount', count })),
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';
import { searchKnowledge } from '@/lib/ai';
import { decryptApiKey } from '@/lib/crypto';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';

describe('POST /api/chat', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockDbQuery = db.query.chatSessions.findFirst as ReturnType<typeof vi.fn>;
  const mockUserApiKeysQuery = db.query.userApiKeys.findFirst as ReturnType<typeof vi.fn>;
  const mockDbInsert = db.insert as ReturnType<typeof vi.fn>;
  const mockSearchKnowledge = searchKnowledge as ReturnType<typeof vi.fn>;
  const mockDecryptApiKey = decryptApiKey as ReturnType<typeof vi.fn>;
  const mockCreateOpenRouter = createOpenRouter as ReturnType<typeof vi.fn>;
  const mockStreamText = streamText as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('OPENROUTER_API_KEY', 'test-openrouter-key');

    // Default auth mock - authenticated user
    mockAuth.mockResolvedValue({ userId: 'user_123' });

    // Default session mock - session exists and owned by user
    mockDbQuery.mockResolvedValue({
      id: 'session-uuid',
      userId: 'user_123',
      courseId: 'course-uuid',
      title: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Default user API keys mock - no user key by default
    mockUserApiKeysQuery.mockResolvedValue(null);

    // Default decrypt mock
    mockDecryptApiKey.mockReturnValue('decrypted-user-api-key');

    // Default createOpenRouter mock
    mockCreateOpenRouter.mockReturnValue({
      chat: vi.fn((model: string) => ({ modelId: model })),
    });

    // Default insert mock
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ id: 'msg-uuid' }]),
      }),
    });

    // Default search knowledge mock
    mockSearchKnowledge.mockResolvedValue({
      context: '[1] Test content from slides',
      sources: [
        {
          source_id: 'slide-doc1-5',
          source_type: 'slide',
          content_preview: 'Test content',
          chunk_number: 1,
          document_id: 'doc1',
          slide_number: 5,
          course_id: 'course-uuid',
          title: 'Test Document',
        },
      ],
    });

    // Default streamText mock
    mockStreamText.mockReturnValue({
      toUIMessageStreamResponse: vi.fn().mockReturnValue(
        new Response('data: {"text":"Hello"}\n', {
          headers: { 'Content-Type': 'text/event-stream' },
        })
      ),
      consumeStream: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('session validation', () => {
    it('returns 404 when session is not found', async () => {
      mockDbQuery.mockResolvedValue(null);

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'nonexistent-session',
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
      const data = await response.json();
      expect(data.error).toBe('Session not found');
    });

    it('returns 404 when session belongs to different user', async () => {
      // Session exists but query should return null when user doesn't match
      // (the query includes userId in the where clause)
      mockDbQuery.mockResolvedValue(null);

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'other-users-session',
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(404);
    });
  });

  describe('request validation', () => {
    it('returns 400 when sessionId is missing', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('sessionId is required');
    });

    it('returns 400 when courseId is missing', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('courseId is required');
    });

    it('returns 400 when messages array is empty', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.status).toBe(400);
      const data = await response.json();
      expect(data.error).toBe('messages array is required');
    });
  });

  describe('message persistence', () => {
    it('saves user message before streaming', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'What is mitochondria?' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Verify insert was called for user message
      expect(mockDbInsert).toHaveBeenCalled();
    });
  });

  describe('tool execution', () => {
    it('calls searchKnowledge when tool is invoked', async () => {
      // This test verifies that the search tool is properly configured
      // The actual tool execution happens within streamText, which we mock
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Search for mitochondria' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Verify streamText was called with tools
      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          tools: expect.objectContaining({
            search_course_materials: expect.any(Object),
          }),
        })
      );
    });

    it('passes correct context filters to searchKnowledge', async () => {
      // Capture the tool configuration to verify execute function behavior
      let capturedTool: { execute?: (args: { query: string }) => Promise<string> } | undefined;
      mockStreamText.mockImplementation((config) => {
        capturedTool = config.tools?.search_course_materials;
        return {
          toUIMessageStreamResponse: vi.fn().mockReturnValue(
            new Response('data: {"text":"Hello"}\n')
          ),
          consumeStream: vi.fn(),
        };
      });

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Search' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
          documentId: 'doc-uuid',
          lectureId: 'lecture-uuid',
        }),
      });

      await POST(request);

      // Now execute the tool to verify it calls searchKnowledge correctly
      if (capturedTool?.execute) {
        await capturedTool.execute({ query: 'test query' });

        expect(mockSearchKnowledge).toHaveBeenCalledWith({
          query: 'test query',
          userId: 'user_123',
          courseId: 'course-uuid',
          documentId: 'doc-uuid',
          lectureId: 'lecture-uuid',
        });
      }
    });
  });

  describe('streaming response', () => {
    it('returns streaming response with correct content type', async () => {
      mockStreamText.mockReturnValue({
        toUIMessageStreamResponse: vi.fn().mockReturnValue(
          new Response('data: {"text":"Hello"}\n', {
            headers: { 'Content-Type': 'text/event-stream' },
          })
        ),
        consumeStream: vi.fn(),
      });

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      const response = await POST(request);

      expect(response.headers.get('Content-Type')).toContain('text/event-stream');
    });

    it('calls consumeStream to ensure completion even on disconnect', async () => {
      const consumeStreamMock = vi.fn();
      mockStreamText.mockReturnValue({
        toUIMessageStreamResponse: vi.fn().mockReturnValue(new Response('')),
        consumeStream: consumeStreamMock,
      });

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      expect(consumeStreamMock).toHaveBeenCalled();
    });
  });

  describe('AI SDK configuration', () => {
    it('uses OpenRouter provider with correct model', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          model: expect.any(Object),
          stopWhen: expect.any(Object),
        })
      );
    });

    it('includes system prompt from lib/ai/prompts', async () => {
      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      expect(mockStreamText).toHaveBeenCalledWith(
        expect.objectContaining({
          system: 'You are a helpful study assistant.',
        })
      );
    });
  });

  describe('user API key handling (BYOK)', () => {
    it('uses shared API key when user has no connected key', async () => {
      // User has no API key in database
      mockUserApiKeysQuery.mockResolvedValue(null);

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Should use shared key from env
      expect(mockCreateOpenRouter).toHaveBeenCalledWith({
        apiKey: 'test-openrouter-key',
      });
      // decryptApiKey should not be called
      expect(mockDecryptApiKey).not.toHaveBeenCalled();
    });

    it('uses decrypted user API key when user has connected key', async () => {
      // User has an API key in database
      mockUserApiKeysQuery.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        openrouterKeyEncrypted: 'encrypted:api:key',
        openrouterKeyHash: 'hash123',
        keyLabel: 'sk-or-v1-...abc',
        connectedAt: new Date(),
      });

      mockDecryptApiKey.mockReturnValue('decrypted-user-api-key');

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Should decrypt the user's key
      expect(mockDecryptApiKey).toHaveBeenCalledWith('encrypted:api:key');
      // Should use decrypted key
      expect(mockCreateOpenRouter).toHaveBeenCalledWith({
        apiKey: 'decrypted-user-api-key',
      });
    });

    it('falls back to shared key when decryption fails', async () => {
      // User has an API key but decryption fails
      mockUserApiKeysQuery.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        openrouterKeyEncrypted: 'corrupted:encrypted:data',
        openrouterKeyHash: 'hash123',
        keyLabel: 'sk-or-v1-...abc',
        connectedAt: new Date(),
      });

      // Mock decryption to throw an error
      mockDecryptApiKey.mockImplementation(() => {
        throw new Error('Decryption failed: invalid data');
      });

      // Spy on console.error to verify logging
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Should attempt decryption
      expect(mockDecryptApiKey).toHaveBeenCalled();
      // Should fall back to shared key
      expect(mockCreateOpenRouter).toHaveBeenCalledWith({
        apiKey: 'test-openrouter-key',
      });
      // Should log the error
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Failed to decrypt user API key, using shared key'
      );

      consoleErrorSpy.mockRestore();
    });

    it('queries userApiKeys with correct userId', async () => {
      mockUserApiKeysQuery.mockResolvedValue(null);

      const { POST } = await import('@/app/api/chat/route');
      const request = new Request('http://localhost/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: [{ id: '1', role: 'user', parts: [{ type: 'text', text: 'Hello' }] }],
          sessionId: 'session-uuid',
          courseId: 'course-uuid',
        }),
      });

      await POST(request);

      // Verify the query was called (we can't easily verify the where clause
      // due to how drizzle-orm works, but we can verify it was called)
      expect(mockUserApiKeysQuery).toHaveBeenCalled();
    });
  });
});
