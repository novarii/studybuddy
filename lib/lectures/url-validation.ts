/**
 * URL validation utilities for preventing SSRF attacks.
 *
 * These functions validate stream URLs to ensure they point to
 * trusted external sources and not internal network resources.
 */

/**
 * Private/internal IP address patterns that should be blocked.
 */
const PRIVATE_IP_PATTERNS = [
  // Loopback
  /^127\./,
  /^localhost$/i,
  // Private networks (RFC 1918)
  /^10\./,
  /^172\.(1[6-9]|2[0-9]|3[01])\./,
  /^192\.168\./,
  // Link-local
  /^169\.254\./,
  // IPv6 loopback and private
  /^::1$/,
  /^fc00:/i,
  /^fd00:/i,
  /^fe80:/i,
  // Cloud metadata endpoints
  /^metadata\.google\.internal$/i,
  /^169\.254\.169\.254$/,
];

/**
 * Allowed URL schemes for stream downloads.
 */
const ALLOWED_SCHEMES = ['https:'];

/**
 * Allowed domain patterns for stream URLs.
 * Only Panopto CDN domains are permitted.
 */
const ALLOWED_DOMAIN_PATTERNS = [
  // Panopto domains (e.g., university.hosted.panopto.com)
  /\.panopto\.com$/i,
  /\.panopto\.eu$/i,
  // Panopto CDN (some instances serve HLS via CloudFront)
  /\.panopto-content\.com$/i,
  /\.cloudfront\.net$/i,
  // Allow localhost/127.0.0.1 only in development
  ...(process.env.NODE_ENV === 'development'
    ? [/^localhost$/i, /^127\.0\.0\.1$/]
    : []),
];

/**
 * Result of URL validation.
 */
export interface UrlValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate a stream URL to prevent SSRF attacks.
 *
 * This function checks:
 * 1. URL is well-formed
 * 2. Scheme is HTTPS only (prevents file://, ftp://, etc.)
 * 3. Host is not a private/internal IP address
 * 4. Host matches allowed domain patterns (Panopto)
 *
 * @param urlString - The URL to validate
 * @returns Validation result with error message if invalid
 */
export function validateStreamUrl(urlString: string): UrlValidationResult {
  // Parse URL
  let url: URL;
  try {
    url = new URL(urlString);
  } catch {
    return { valid: false, error: 'Invalid URL format' };
  }

  // Check scheme (HTTPS only)
  if (!ALLOWED_SCHEMES.includes(url.protocol)) {
    return {
      valid: false,
      error: `Invalid URL scheme: only HTTPS is allowed`,
    };
  }

  const hostname = url.hostname.toLowerCase();

  // Block private/internal IP addresses
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        error: 'URL points to a private or internal address',
      };
    }
  }

  // Check if hostname matches allowed patterns
  const isAllowedDomain = ALLOWED_DOMAIN_PATTERNS.some((pattern) =>
    pattern.test(hostname)
  );

  if (!isAllowedDomain) {
    return {
      valid: false,
      error: 'URL domain is not in the allowed list (only Panopto domains are permitted)',
    };
  }

  return { valid: true };
}
