import { describe, it, expect } from 'vitest';

import { extractPanoptoSessionId } from '@/lib/lectures/utils';

describe('extractPanoptoSessionId', () => {
  describe('query parameter extraction', () => {
    it('should extract id from query param', () => {
      const url = 'https://panopto.example.com/Viewer?id=abc123-def456';
      expect(extractPanoptoSessionId(url)).toBe('abc123-def456');
    });

    it('should extract sessionId from query param', () => {
      const url = 'https://panopto.example.com/Viewer?sessionId=session-xyz';
      expect(extractPanoptoSessionId(url)).toBe('session-xyz');
    });

    it('should extract session_id from query param', () => {
      const url = 'https://panopto.example.com/Viewer?session_id=my-session-id';
      expect(extractPanoptoSessionId(url)).toBe('my-session-id');
    });

    it('should extract sid from query param', () => {
      const url = 'https://panopto.example.com/Viewer?sid=short-id';
      expect(extractPanoptoSessionId(url)).toBe('short-id');
    });

    it('should prioritize id over other query params', () => {
      const url = 'https://panopto.example.com/Viewer?sessionId=wrong&id=correct&sid=also-wrong';
      expect(extractPanoptoSessionId(url)).toBe('correct');
    });

    it('should trim whitespace from query param value', () => {
      const url = 'https://panopto.example.com/Viewer?id=%20abc123%20';
      expect(extractPanoptoSessionId(url)).toBe('abc123');
    });

    it('should handle query params with other parameters present', () => {
      const url = 'https://panopto.example.com/Viewer?course=math101&id=lecture-1&format=hd';
      expect(extractPanoptoSessionId(url)).toBe('lecture-1');
    });
  });

  describe('path segment extraction', () => {
    it('should extract last path segment when no query param', () => {
      const url = 'https://panopto.example.com/sessions/abc123';
      expect(extractPanoptoSessionId(url)).toBe('abc123');
    });

    it('should handle nested path segments', () => {
      const url = 'https://panopto.example.com/course/math101/sessions/lecture-5';
      expect(extractPanoptoSessionId(url)).toBe('lecture-5');
    });

    it('should ignore trailing slashes', () => {
      const url = 'https://panopto.example.com/sessions/abc123/';
      expect(extractPanoptoSessionId(url)).toBe('abc123');
    });

    it('should handle URLs with only path', () => {
      const url = 'https://panopto.example.com/abc-def-ghi';
      expect(extractPanoptoSessionId(url)).toBe('abc-def-ghi');
    });
  });

  describe('priority: query params over path', () => {
    it('should prefer query param over path segment', () => {
      const url = 'https://panopto.example.com/sessions/wrong-id?id=correct-id';
      expect(extractPanoptoSessionId(url)).toBe('correct-id');
    });
  });

  describe('error cases', () => {
    it('should throw for URL with no path and no query params', () => {
      const url = 'https://panopto.example.com/';
      expect(() => extractPanoptoSessionId(url)).toThrow(
        'Unable to determine Panopto session id from URL'
      );
    });

    it('should throw for URL with only root path', () => {
      const url = 'https://panopto.example.com';
      expect(() => extractPanoptoSessionId(url)).toThrow(
        'Unable to determine Panopto session id from URL'
      );
    });

    it('should throw for invalid URL', () => {
      expect(() => extractPanoptoSessionId('not-a-valid-url')).toThrow();
    });

    it('should throw for empty string', () => {
      expect(() => extractPanoptoSessionId('')).toThrow();
    });
  });

  describe('real-world URL patterns', () => {
    it('should handle Panopto Viewer URL', () => {
      const url = 'https://university.hosted.panopto.com/Panopto/Pages/Viewer.aspx?id=12345678-abcd-1234-efgh-ijklmnopqrst';
      expect(extractPanoptoSessionId(url)).toBe('12345678-abcd-1234-efgh-ijklmnopqrst');
    });

    it('should handle Panopto Embed URL', () => {
      const url = 'https://university.hosted.panopto.com/Panopto/Pages/Embed.aspx?id=uuid-session-id&autoplay=false';
      expect(extractPanoptoSessionId(url)).toBe('uuid-session-id');
    });

    it('should handle CloudFront stream URL with session path', () => {
      const url = 'https://d123456.cloudfront.net/sessions/lecture-12345/master.m3u8';
      expect(extractPanoptoSessionId(url)).toBe('master.m3u8');
    });
  });
});
