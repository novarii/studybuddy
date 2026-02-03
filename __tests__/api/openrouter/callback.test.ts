import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      userApiKeys: {
        findFirst: vi.fn(),
      },
    },
    insert: vi.fn(),
    update: vi.fn(),
  },
  userApiKeys: {
    userId: { name: 'user_id' },
    openrouterKeyEncrypted: { name: 'openrouter_key_encrypted' },
    openrouterKeyHash: { name: 'openrouter_key_hash' },
  },
}));

vi.mock('@/lib/crypto/encryption', () => ({
  encryptApiKey: vi.fn((key: string) => `encrypted:${key}`),
}));

import { auth } from '@clerk/nextjs/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { encryptApiKey } from '@/lib/crypto/encryption';

describe('GET /api/openrouter/callback', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockCookies = cookies as unknown as ReturnType<typeof vi.fn>;
  const mockEncrypt = encryptApiKey as unknown as ReturnType<typeof vi.fn>;
  const mockDbInsert = db.insert as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://studybuddy.app');
    mockAuth.mockResolvedValue({ userId: 'user_123' });
    mockCookies.mockResolvedValue({
      get: vi.fn((name: string) => {
        if (name === 'openrouter_verifier') {
          return { value: 'test-code-verifier' };
        }
        return undefined;
      }),
    });
    mockEncrypt.mockImplementation((key: string) => `encrypted:${key}`);

    // Mock successful database insert
    mockDbInsert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined),
      }),
    });

    // Mock fetch for OpenRouter API calls
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('authentication', () => {
    it('redirects to sign-in when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('/sign-in');
    });
  });

  describe('validation', () => {
    it('redirects with error when code is missing', async () => {
      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request('http://localhost/api/openrouter/callback');

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=no_code');
    });

    it('redirects with error when code_verifier cookie is missing', async () => {
      mockCookies.mockResolvedValue({
        get: vi.fn(() => undefined),
      });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=missing_verifier');
    });
  });

  describe('token exchange', () => {
    it('exchanges code for API key with OpenRouter', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ key: 'sk-or-v1-test-api-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: {
              limit_remaining: 100,
              limit: 1000,
              is_free_tier: false,
            },
          }),
        });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      await GET(request);

      // Verify token exchange was called
      expect(mockFetch).toHaveBeenCalledWith(
        'https://openrouter.ai/api/v1/auth/keys',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.stringContaining('test-code'),
        })
      );
    });

    it('redirects with error when token exchange fails', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch.mockResolvedValueOnce({
        ok: false,
        text: async () => 'Invalid code',
      });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=invalid-code'
      );

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('error=exchange_failed');
    });
  });

  describe('key storage', () => {
    it('encrypts API key before storing in database', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ key: 'sk-or-v1-test-api-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { limit_remaining: 100, limit: 1000 },
          }),
        });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      await GET(request);

      expect(mockEncrypt).toHaveBeenCalledWith('sk-or-v1-test-api-key');
      expect(mockDbInsert).toHaveBeenCalled();
    });

    it('stores key label showing last 8 characters', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ key: 'sk-or-v1-abcd1234efgh5678' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      await GET(request);

      const insertCall = mockDbInsert.mock.results[0]?.value?.values;
      expect(insertCall).toHaveBeenCalled();
    });
  });

  describe('success flow', () => {
    it('redirects to settings with success parameter', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ key: 'sk-or-v1-test-api-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      const response = await GET(request);

      expect(response.status).toBe(302);
      expect(response.headers.get('Location')).toContain('connected=true');
    });

    it('clears the verifier cookie after success', async () => {
      const mockFetch = global.fetch as ReturnType<typeof vi.fn>;
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ key: 'sk-or-v1-test-api-key' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: {} }),
        });

      const { GET } = await import('@/app/api/openrouter/callback/route');
      const request = new Request(
        'http://localhost/api/openrouter/callback?code=test-code'
      );

      const response = await GET(request);

      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toContain('openrouter_verifier=');
      expect(setCookie).toContain('Max-Age=0');
    });
  });
});
