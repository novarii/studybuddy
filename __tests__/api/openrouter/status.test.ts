import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock modules before importing the route
vi.mock('@clerk/nextjs/server', () => ({
  auth: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    query: {
      userApiKeys: {
        findFirst: vi.fn(),
      },
    },
  },
  userApiKeys: {
    userId: { name: 'user_id' },
  },
}));

import { auth } from '@clerk/nextjs/server';
import { db } from '@/lib/db';

describe('GET /api/openrouter/status', () => {
  const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;
  const mockFindFirst = db.query.userApiKeys.findFirst as ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockAuth.mockResolvedValue({ userId: 'user_123' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('authentication', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockAuth.mockResolvedValue({ userId: null });

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('not connected', () => {
    it('returns connected: false when user has no API key', async () => {
      mockFindFirst.mockResolvedValue(null);

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.connected).toBe(false);
      expect(data.usingSharedKey).toBe(true);
    });
  });

  describe('connected', () => {
    it('returns connected: true with key info when user has API key', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        keyLabel: 'sk-or-v1-...abc12345',
        creditsRemaining: '500.00',
        creditsLimit: '1000.00',
        isFreeTier: false,
        connectedAt: new Date('2024-01-15T10:00:00Z'),
        lastVerifiedAt: new Date('2024-01-16T10:00:00Z'),
      });

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data.connected).toBe(true);
      expect(data.usingSharedKey).toBe(false);
      expect(data.keyLabel).toBe('sk-or-v1-...abc12345');
      expect(data.creditsRemaining).toBe('500.00');
      expect(data.creditsLimit).toBe('1000.00');
      expect(data.isFreeTier).toBe(false);
    });

    it('returns timestamps in ISO format', async () => {
      const connectedAt = new Date('2024-01-15T10:00:00Z');
      const lastVerifiedAt = new Date('2024-01-16T10:00:00Z');

      mockFindFirst.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        keyLabel: 'sk-or-v1-...test',
        creditsRemaining: null,
        creditsLimit: null,
        isFreeTier: true,
        connectedAt,
        lastVerifiedAt,
      });

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      const data = await response.json();
      expect(data.connectedAt).toBe(connectedAt.toISOString());
      expect(data.lastVerifiedAt).toBe(lastVerifiedAt.toISOString());
    });

    it('handles null credits values', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        keyLabel: 'sk-or-v1-...test',
        creditsRemaining: null,
        creditsLimit: null,
        isFreeTier: true,
        connectedAt: new Date(),
        lastVerifiedAt: null,
      });

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      const data = await response.json();
      expect(data.connected).toBe(true);
      expect(data.creditsRemaining).toBeNull();
      expect(data.creditsLimit).toBeNull();
    });
  });

  describe('never exposes encrypted key', () => {
    it('response does not contain encrypted key or hash', async () => {
      mockFindFirst.mockResolvedValue({
        id: 'key-uuid',
        userId: 'user_123',
        openrouterKeyEncrypted: 'encrypted-data-here',
        openrouterKeyHash: 'hash-data-here',
        keyLabel: 'sk-or-v1-...test',
        creditsRemaining: '100',
        creditsLimit: '1000',
        isFreeTier: false,
        connectedAt: new Date(),
        lastVerifiedAt: new Date(),
      });

      const { GET } = await import('@/app/api/openrouter/status/route');
      const request = new Request('http://localhost/api/openrouter/status');

      const response = await GET(request);

      const data = await response.json();
      expect(data.openrouterKeyEncrypted).toBeUndefined();
      expect(data.openrouterKeyHash).toBeUndefined();
      expect(JSON.stringify(data)).not.toContain('encrypted-data-here');
      expect(JSON.stringify(data)).not.toContain('hash-data-here');
    });
  });
});
