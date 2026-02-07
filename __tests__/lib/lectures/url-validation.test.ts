import { describe, it, expect } from 'vitest';

import { validateStreamUrl } from '@/lib/lectures/url-validation';

describe('validateStreamUrl', () => {
  describe('valid URLs', () => {
    it('accepts Panopto .com domains', () => {
      const result = validateStreamUrl('https://university.hosted.panopto.com/Panopto/stream.m3u8');
      expect(result.valid).toBe(true);
    });

    it('accepts Panopto .eu domains', () => {
      const result = validateStreamUrl('https://university.panopto.eu/Panopto/stream.m3u8');
      expect(result.valid).toBe(true);
    });

    it('accepts Panopto content CDN domains', () => {
      const result = validateStreamUrl('https://content.panopto-content.com/stream.m3u8');
      expect(result.valid).toBe(true);
    });

    it('accepts URLs with query parameters', () => {
      const result = validateStreamUrl('https://example.panopto.com/stream.m3u8?token=abc&expires=123');
      expect(result.valid).toBe(true);
    });

    it('accepts URLs with paths', () => {
      const result = validateStreamUrl('https://uni.panopto.com/Panopto/Podcast/Stream/session-id/master.m3u8');
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid URLs', () => {
    it('rejects non-HTTPS URLs', () => {
      const result = validateStreamUrl('http://university.panopto.com/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('rejects file:// URLs', () => {
      const result = validateStreamUrl('file:///etc/passwd');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('rejects ftp:// URLs', () => {
      const result = validateStreamUrl('ftp://example.com/file');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('HTTPS');
    });

    it('rejects non-Panopto domains', () => {
      const result = validateStreamUrl('https://cloudfront.net/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in the allowed list');
    });

    it('rejects arbitrary domains', () => {
      const result = validateStreamUrl('https://evil.com/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('not in the allowed list');
    });

    it('rejects domains that contain panopto but are not subdomains', () => {
      const result = validateStreamUrl('https://notpanopto.com/stream.m3u8');
      expect(result.valid).toBe(false);
    });
  });

  describe('SSRF protection - private IPs', () => {
    it('rejects localhost', () => {
      const result = validateStreamUrl('https://localhost/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects 127.0.0.1', () => {
      const result = validateStreamUrl('https://127.0.0.1/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects 10.x.x.x range', () => {
      const result = validateStreamUrl('https://10.0.0.1/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects 192.168.x.x range', () => {
      const result = validateStreamUrl('https://192.168.1.1/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects 172.16-31.x.x range', () => {
      const result = validateStreamUrl('https://172.16.0.1/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects cloud metadata endpoint', () => {
      const result = validateStreamUrl('https://169.254.169.254/latest/meta-data');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });

    it('rejects link-local addresses', () => {
      const result = validateStreamUrl('https://169.254.1.1/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('private or internal');
    });
  });

  describe('malformed URLs', () => {
    it('rejects invalid URL format', () => {
      const result = validateStreamUrl('not-a-url');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('rejects empty string', () => {
      const result = validateStreamUrl('');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });

    it('rejects URL without protocol', () => {
      const result = validateStreamUrl('panopto.com/stream.m3u8');
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid URL');
    });
  });

  // Note: Development mode (localhost/127.0.0.1 allowed) is configured at module
  // load time based on NODE_ENV. In production, these are blocked for security.
});
