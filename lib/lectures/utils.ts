/**
 * Utility functions for lecture processing.
 */

/**
 * Extract the Panopto session ID from a URL.
 *
 * Looks for the session ID in multiple locations:
 * 1. Query parameters: id, sessionId, session_id, sid
 * 2. Last path segment (fallback)
 *
 * @param url - The Panopto URL to parse
 * @returns The extracted session ID
 * @throws Error if no session ID can be determined
 *
 * @example
 * // Query parameter extraction
 * extractPanoptoSessionId('https://panopto.example.com/Viewer?id=abc123')
 * // => 'abc123'
 *
 * @example
 * // Path segment extraction
 * extractPanoptoSessionId('https://panopto.example.com/sessions/abc123')
 * // => 'abc123'
 */
export function extractPanoptoSessionId(url: string): string {
  const parsed = new URL(url);

  // Check query parameters first
  const queryKeys = ['id', 'sessionId', 'session_id', 'sid'];
  for (const key of queryKeys) {
    const value = parsed.searchParams.get(key);
    if (value) {
      return value.trim();
    }
  }

  // Fall back to last path segment
  const pathSegments = parsed.pathname
    .split('/')
    .filter((segment) => segment.length > 0);

  if (pathSegments.length > 0) {
    return pathSegments[pathSegments.length - 1];
  }

  throw new Error('Unable to determine Panopto session id from URL');
}
