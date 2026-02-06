/**
 * Simple in-memory store for PKCE verifiers.
 *
 * This avoids cookie issues with cross-site redirects.
 * For multi-instance deployments, replace with Redis or database storage.
 */

interface VerifierEntry {
  verifier: string;
  expiresAt: number;
}

// Map of userId -> verifier entry
const verifierStore = new Map<string, VerifierEntry>();

// Clean up expired entries every 5 minutes
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const VERIFIER_TTL = 10 * 60 * 1000; // 10 minutes

let cleanupInterval: NodeJS.Timeout | null = null;

function startCleanup() {
  if (cleanupInterval) return;
  cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [userId, entry] of verifierStore.entries()) {
      if (entry.expiresAt < now) {
        verifierStore.delete(userId);
      }
    }
  }, CLEANUP_INTERVAL);
}

/**
 * Store a PKCE verifier for a user.
 */
export function storeVerifier(userId: string, verifier: string): void {
  startCleanup();
  verifierStore.set(userId, {
    verifier,
    expiresAt: Date.now() + VERIFIER_TTL,
  });
}

/**
 * Retrieve and delete a PKCE verifier for a user.
 * Returns null if not found or expired.
 */
export function retrieveVerifier(userId: string): string | null {
  const entry = verifierStore.get(userId);
  if (!entry) return null;

  // Delete after retrieval (one-time use)
  verifierStore.delete(userId);

  // Check if expired
  if (entry.expiresAt < Date.now()) return null;

  return entry.verifier;
}
