import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { encryptApiKey, decryptApiKey } from '@/lib/crypto/encryption';

describe('encryption', () => {
  // Valid 32-byte key (base64 encoded)
  const validKey = 'nQLgAOROYc+1Cxw+c5PYFdJNZblDhRoRnJ492GocLW0=';

  beforeEach(() => {
    vi.stubEnv('ENCRYPTION_KEY', validKey);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('encryptApiKey', () => {
    it('returns encrypted string in expected format (iv:authTag:ciphertext)', () => {
      const apiKey = 'sk-or-v1-test1234567890abcdef';
      const encrypted = encryptApiKey(apiKey);

      // Verify format: base64:base64:base64
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);

      // Each part should be valid base64
      parts.forEach((part) => {
        expect(() => Buffer.from(part, 'base64')).not.toThrow();
        expect(Buffer.from(part, 'base64').length).toBeGreaterThan(0);
      });
    });

    it('produces different ciphertext for same input (random IV)', () => {
      const apiKey = 'sk-or-v1-test1234567890abcdef';
      const encrypted1 = encryptApiKey(apiKey);
      const encrypted2 = encryptApiKey(apiKey);

      // Encrypted outputs should differ due to random IV
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('handles empty string input', () => {
      const encrypted = encryptApiKey('');
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('handles long API keys', () => {
      const longKey = 'sk-or-v1-' + 'a'.repeat(200);
      const encrypted = encryptApiKey(longKey);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('handles special characters in API key', () => {
      const specialKey = 'sk-or-v1-test!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptApiKey(specialKey);
      const parts = encrypted.split(':');
      expect(parts).toHaveLength(3);
    });

    it('throws when ENCRYPTION_KEY is not set', () => {
      vi.stubEnv('ENCRYPTION_KEY', '');

      expect(() => encryptApiKey('test-key')).toThrow(
        'ENCRYPTION_KEY environment variable is not set'
      );
    });
  });

  describe('decryptApiKey', () => {
    it('decrypts correctly encrypted data', () => {
      const originalKey = 'sk-or-v1-test1234567890abcdef';
      const encrypted = encryptApiKey(originalKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(originalKey);
    });

    it('round-trips API key correctly', () => {
      const apiKey = 'sk-or-v1-f58e232849c5ff816cdc67197636b42cbf5976dd';
      const encrypted = encryptApiKey(apiKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(apiKey);
    });

    it('round-trips empty string', () => {
      const encrypted = encryptApiKey('');
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe('');
    });

    it('round-trips long API keys', () => {
      const longKey = 'sk-or-v1-' + 'b'.repeat(200);
      const encrypted = encryptApiKey(longKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(longKey);
    });

    it('round-trips special characters', () => {
      const specialKey = 'sk-or-v1-test!@#$%^&*()_+-=[]{}|;:,.<>?';
      const encrypted = encryptApiKey(specialKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(specialKey);
    });

    it('round-trips unicode characters', () => {
      const unicodeKey = 'sk-or-v1-test-🔑-key-日本語';
      const encrypted = encryptApiKey(unicodeKey);
      const decrypted = decryptApiKey(encrypted);

      expect(decrypted).toBe(unicodeKey);
    });

    it('throws on tampered ciphertext', () => {
      const apiKey = 'sk-or-v1-test1234567890abcdef';
      const encrypted = encryptApiKey(apiKey);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper with ciphertext
      const tamperedCiphertext = ciphertext.slice(0, -1) + 'X';
      const tamperedEncrypted = `${iv}:${authTag}:${tamperedCiphertext}`;

      expect(() => decryptApiKey(tamperedEncrypted)).toThrow();
    });

    it('throws on tampered auth tag', () => {
      const apiKey = 'sk-or-v1-test1234567890abcdef';
      const encrypted = encryptApiKey(apiKey);
      const [iv, authTag, ciphertext] = encrypted.split(':');

      // Tamper with auth tag by flipping bits in the decoded buffer
      const authTagBuffer = Buffer.from(authTag, 'base64');
      authTagBuffer[0] = authTagBuffer[0] ^ 0xff; // Flip all bits in first byte
      const tamperedAuthTag = authTagBuffer.toString('base64');
      const tamperedEncrypted = `${iv}:${tamperedAuthTag}:${ciphertext}`;

      expect(() => decryptApiKey(tamperedEncrypted)).toThrow();
    });

    it('throws on invalid format (missing parts)', () => {
      expect(() => decryptApiKey('invalid-format')).toThrow();
      expect(() => decryptApiKey('part1:part2')).toThrow();
    });

    it('throws on invalid base64 encoding', () => {
      expect(() => decryptApiKey('!!!:@@@:###')).toThrow();
    });

    it('throws when ENCRYPTION_KEY is not set', () => {
      const encrypted = encryptApiKey('test-key');
      vi.stubEnv('ENCRYPTION_KEY', '');

      expect(() => decryptApiKey(encrypted)).toThrow(
        'ENCRYPTION_KEY environment variable is not set'
      );
    });
  });

  describe('encryption key validation', () => {
    it('handles 32-byte key correctly', () => {
      // The default key in beforeEach is valid 32 bytes
      const apiKey = 'test-key';
      expect(() => encryptApiKey(apiKey)).not.toThrow();
    });

    it('throws on invalid key length (too short)', () => {
      vi.stubEnv('ENCRYPTION_KEY', 'dG9vLXNob3J0'); // "too-short" base64

      expect(() => encryptApiKey('test-key')).toThrow();
    });
  });

  describe('deterministic behavior', () => {
    it('same key decrypts same data across multiple calls', () => {
      const apiKey = 'sk-or-v1-consistent-test-key';
      const encrypted = encryptApiKey(apiKey);

      // Decrypt multiple times
      const decrypted1 = decryptApiKey(encrypted);
      const decrypted2 = decryptApiKey(encrypted);
      const decrypted3 = decryptApiKey(encrypted);

      expect(decrypted1).toBe(apiKey);
      expect(decrypted2).toBe(apiKey);
      expect(decrypted3).toBe(apiKey);
    });
  });
});
