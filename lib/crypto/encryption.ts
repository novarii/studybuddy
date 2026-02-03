/**
 * API key encryption utilities using AES-256-GCM.
 *
 * Uses authenticated encryption to securely store API keys at rest.
 * Format: iv:authTag:ciphertext (all base64 encoded)
 */
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  type CipherGCMTypes,
} from 'crypto';

const ALGORITHM: CipherGCMTypes = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const keyBase64 = process.env.ENCRYPTION_KEY;
  if (!keyBase64) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }

  const key = Buffer.from(keyBase64, 'base64');
  if (key.length !== 32) {
    throw new Error(
      `Invalid ENCRYPTION_KEY length: expected 32 bytes, got ${key.length}`
    );
  }

  return key;
}

/**
 * Encrypts an API key using AES-256-GCM.
 *
 * @param plaintext - The API key to encrypt
 * @returns Encrypted string in format: iv:authTag:ciphertext (base64 encoded)
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all base64)
  return `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
}

/**
 * Decrypts an encrypted API key.
 *
 * @param encrypted - Encrypted string in format: iv:authTag:ciphertext
 * @returns The decrypted API key
 * @throws Error if decryption fails (tampered data, wrong key, invalid format)
 */
export function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey();

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      `Invalid encrypted format: expected 3 parts (iv:authTag:ciphertext), got ${parts.length}`
    );
  }

  const [ivBase64, authTagBase64, ciphertext] = parts;

  const iv = Buffer.from(ivBase64, 'base64');
  const authTag = Buffer.from(authTagBase64, 'base64');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
}
