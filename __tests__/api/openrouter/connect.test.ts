import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

import { auth } from '@clerk/nextjs/server';

describe('GET /api/openrouter/connect', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://studybuddy.app');
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('PKCE flow initiation', () => {
    it('redirects to OpenRouter auth URL with PKCE challenge', async () => {
      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      // Should redirect (3xx status)
      expect(response.status).toBe(302);

      // Verify redirect URL
      const location = response.headers.get('Location');
      expect(location).toBeTruthy();

      const redirectUrl = new URL(location!);
      expect(redirectUrl.origin).toBe('https://openrouter.ai');
      expect(redirectUrl.pathname).toBe('/auth');
      expect(redirectUrl.searchParams.get('callback_url')).toBe(
        'https://studybuddy.app/api/openrouter/callback'
      );
      expect(redirectUrl.searchParams.get('code_challenge')).toBeTruthy();
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('sets HttpOnly cookie with code verifier', async () => {
      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      const setCookie = response.headers.get('Set-Cookie');
      expect(setCookie).toBeTruthy();
      expect(setCookie).toContain('openrouter_verifier=');
      expect(setCookie).toContain('HttpOnly');
      // Secure flag only added in production (NODE_ENV === 'production')
      if (process.env.NODE_ENV === 'production') {
        expect(setCookie).toContain('Secure');
      }
      expect(setCookie).toContain('SameSite=Lax');
      expect(setCookie).toContain('Max-Age=600');
      expect(setCookie).toContain('Path=/');
    });

    it('uses SHA-256 for PKCE code challenge method', async () => {
      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      const location = response.headers.get('Location');
      const redirectUrl = new URL(location!);
      expect(redirectUrl.searchParams.get('code_challenge_method')).toBe('S256');
    });

    it('generates valid base64url code verifier', async () => {
      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      const setCookie = response.headers.get('Set-Cookie');
      const verifierMatch = setCookie?.match(/openrouter_verifier=([^;]+)/);
      expect(verifierMatch).toBeTruthy();
      const verifier = verifierMatch![1];
      // base64url should only contain A-Z, a-z, 0-9, -, _
      expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
    });
  });

  describe('environment validation', () => {
    it('returns 500 when NEXT_PUBLIC_APP_URL is not set', async () => {
      vi.stubEnv('NEXT_PUBLIC_APP_URL', '');

      const { GET } = await import('@/app/api/openrouter/connect/route');

      const response = await GET();

      expect(response.status).toBe(500);
      const data = await response.json();
      expect(data.error).toContain('configuration');
    });
  });
});
