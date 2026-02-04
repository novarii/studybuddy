import { describe, it, expect, vi, beforeEach, afterEach, Mock } from 'vitest';

// Mock dependencies
vi.mock('@/lib/db', () => ({
  db: {
    query: {
      userApiKeys: {
        findFirst: vi.fn(),
      },
    },
  },
  userApiKeys: {},
}));

vi.mock('@/lib/crypto', () => ({
  decryptApiKey: vi.fn(),
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((field, value) => ({ field, value })),
}));

import { db } from '@/lib/db';
import { decryptApiKey } from '@/lib/crypto';
import { getUserApiKey } from '@/lib/api-keys/get-user-api-key';

describe('getUserApiKey', () => {
  const mockUserId = 'user_123';
  const mockEncryptedKey = 'encrypted:api:key';
  const mockDecryptedKey = 'sk-user-api-key-12345';
  const sharedApiKey = 'sk-shared-api-key-67890';

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('OPENROUTER_API_KEY', sharedApiKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should return decrypted user key when BYOK is configured', async () => {
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue({
      userId: mockUserId,
      openrouterKeyEncrypted: mockEncryptedKey,
    });
    (decryptApiKey as Mock).mockReturnValue(mockDecryptedKey);

    const result = await getUserApiKey(mockUserId);

    expect(result).toBe(mockDecryptedKey);
    expect(decryptApiKey).toHaveBeenCalledWith(mockEncryptedKey);
  });

  it('should fall back to shared key when user has no BYOK key', async () => {
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue(null);

    const result = await getUserApiKey(mockUserId);

    expect(result).toBe(sharedApiKey);
    expect(decryptApiKey).not.toHaveBeenCalled();
  });

  it('should fall back to shared key when decryption fails', async () => {
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue({
      userId: mockUserId,
      openrouterKeyEncrypted: mockEncryptedKey,
    });
    (decryptApiKey as Mock).mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await getUserApiKey(mockUserId);

    expect(result).toBe(sharedApiKey);
    expect(consoleSpy).toHaveBeenCalled();
    expect(consoleSpy.mock.calls[0][0]).toContain('Failed to decrypt');

    consoleSpy.mockRestore();
  });

  it('should throw error when no API key is available', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue(null);

    await expect(getUserApiKey(mockUserId)).rejects.toThrow(
      'No API key available'
    );
  });

  it('should throw error when BYOK decryption fails and no shared key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue({
      userId: mockUserId,
      openrouterKeyEncrypted: mockEncryptedKey,
    });
    (decryptApiKey as Mock).mockImplementation(() => {
      throw new Error('Decryption failed');
    });

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(getUserApiKey(mockUserId)).rejects.toThrow(
      'No API key available'
    );

    consoleSpy.mockRestore();
  });

  it('should query database with correct user ID', async () => {
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue(null);

    await getUserApiKey(mockUserId);

    expect(db.query.userApiKeys.findFirst).toHaveBeenCalledTimes(1);
    expect(db.query.userApiKeys.findFirst).toHaveBeenCalledWith({
      where: expect.anything(),
    });
  });

  it('should handle undefined OPENROUTER_API_KEY gracefully with user key', async () => {
    vi.stubEnv('OPENROUTER_API_KEY', '');
    (db.query.userApiKeys.findFirst as Mock).mockResolvedValue({
      userId: mockUserId,
      openrouterKeyEncrypted: mockEncryptedKey,
    });
    (decryptApiKey as Mock).mockReturnValue(mockDecryptedKey);

    const result = await getUserApiKey(mockUserId);

    expect(result).toBe(mockDecryptedKey);
  });
});
