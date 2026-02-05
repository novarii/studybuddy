import { describe, it, expect } from 'vitest';
import { getTableName } from 'drizzle-orm';
import {
  chatSessions,
  chatMessages,
  messageSources,
  userApiKeys,
  documents,
  lectures,
  userLectures,
  courses,
  userCourses,
  aiSchema,
} from '@/lib/db/schema';

describe('Database Schema', () => {
  describe('aiSchema', () => {
    it('should use the ai schema namespace', () => {
      expect(aiSchema.schemaName).toBe('ai');
    });
  });

  describe('chatSessions table', () => {
    it('should have correct table name', () => {
      expect(getTableName(chatSessions)).toBe('chat_sessions');
    });

    it('should have required columns', () => {
      const columns = Object.keys(chatSessions);
      expect(columns).toContain('id');
      expect(columns).toContain('userId');
      expect(columns).toContain('courseId');
      expect(columns).toContain('title');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('chatMessages table', () => {
    it('should have correct table name', () => {
      expect(getTableName(chatMessages)).toBe('chat_messages');
    });

    it('should have required columns', () => {
      const columns = Object.keys(chatMessages);
      expect(columns).toContain('id');
      expect(columns).toContain('sessionId');
      expect(columns).toContain('role');
      expect(columns).toContain('content');
      expect(columns).toContain('createdAt');
    });
  });

  describe('messageSources table', () => {
    it('should have correct table name', () => {
      expect(getTableName(messageSources)).toBe('message_sources');
    });

    it('should have required columns', () => {
      const columns = Object.keys(messageSources);
      expect(columns).toContain('id');
      expect(columns).toContain('messageId');
      expect(columns).toContain('sessionId');
      expect(columns).toContain('sourceId');
      expect(columns).toContain('sourceType');
      expect(columns).toContain('chunkNumber');
    });

    it('should have optional metadata columns', () => {
      const columns = Object.keys(messageSources);
      expect(columns).toContain('documentId');
      expect(columns).toContain('slideNumber');
      expect(columns).toContain('lectureId');
      expect(columns).toContain('startSeconds');
      expect(columns).toContain('endSeconds');
    });
  });

  describe('userApiKeys table', () => {
    it('should have correct table name', () => {
      expect(getTableName(userApiKeys)).toBe('user_api_keys');
    });

    it('should have required columns', () => {
      const columns = Object.keys(userApiKeys);
      expect(columns).toContain('id');
      expect(columns).toContain('userId');
      expect(columns).toContain('openrouterKeyEncrypted');
      expect(columns).toContain('openrouterKeyHash');
    });

    it('should have optional metadata columns', () => {
      const columns = Object.keys(userApiKeys);
      expect(columns).toContain('keyLabel');
      expect(columns).toContain('creditsRemaining');
      expect(columns).toContain('creditsLimit');
      expect(columns).toContain('isFreeTier');
    });

    it('should have timestamp columns', () => {
      const columns = Object.keys(userApiKeys);
      expect(columns).toContain('connectedAt');
      expect(columns).toContain('lastVerifiedAt');
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('documents table', () => {
    it('should have correct table name', () => {
      expect(getTableName(documents)).toBe('documents');
    });

    it('should have required columns', () => {
      const columns = Object.keys(documents);
      expect(columns).toContain('id');
      expect(columns).toContain('userId');
      expect(columns).toContain('courseId');
      expect(columns).toContain('filename');
      expect(columns).toContain('checksum');
      expect(columns).toContain('status');
      expect(columns).toContain('filePath');
    });

    it('should have processing status columns', () => {
      const columns = Object.keys(documents);
      expect(columns).toContain('pageCount');
      expect(columns).toContain('uniquePageCount');
      expect(columns).toContain('failedPages');
      expect(columns).toContain('errorMessage');
    });

    it('should have file path columns', () => {
      const columns = Object.keys(documents);
      expect(columns).toContain('filePath');
      expect(columns).toContain('processedFilePath');
    });

    it('should have timestamp columns', () => {
      const columns = Object.keys(documents);
      expect(columns).toContain('createdAt');
      expect(columns).toContain('processedAt');
    });
  });

  describe('lectures table', () => {
    it('should have correct table name', () => {
      expect(getTableName(lectures)).toBe('lectures');
    });

    it('should have required columns', () => {
      const columns = Object.keys(lectures);
      expect(columns).toContain('id');
      expect(columns).toContain('courseId');
      expect(columns).toContain('panoptoSessionId');
      expect(columns).toContain('title');
      expect(columns).toContain('status');
    });

    it('should have Panopto-related columns', () => {
      const columns = Object.keys(lectures);
      expect(columns).toContain('panoptoUrl');
      expect(columns).toContain('streamUrl');
    });

    it('should have processing metadata columns', () => {
      const columns = Object.keys(lectures);
      expect(columns).toContain('durationSeconds');
      expect(columns).toContain('chunkCount');
      expect(columns).toContain('errorMessage');
    });

    it('should have timestamp columns', () => {
      const columns = Object.keys(lectures);
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('userLectures table', () => {
    it('should have correct table name', () => {
      expect(getTableName(userLectures)).toBe('user_lectures');
    });

    it('should have required columns', () => {
      const columns = Object.keys(userLectures);
      expect(columns).toContain('userId');
      expect(columns).toContain('lectureId');
      expect(columns).toContain('createdAt');
    });
  });

  describe('courses table', () => {
    it('should have correct table name', () => {
      expect(getTableName(courses)).toBe('courses');
    });

    it('should have required columns', () => {
      const columns = Object.keys(courses);
      expect(columns).toContain('id');
      expect(columns).toContain('code');
      expect(columns).toContain('title');
    });

    it('should have optional metadata columns', () => {
      const columns = Object.keys(courses);
      expect(columns).toContain('instructor');
      expect(columns).toContain('isOfficial');
    });

    it('should have timestamp columns', () => {
      const columns = Object.keys(courses);
      expect(columns).toContain('createdAt');
      expect(columns).toContain('updatedAt');
    });
  });

  describe('userCourses table', () => {
    it('should have correct table name', () => {
      expect(getTableName(userCourses)).toBe('user_courses');
    });

    it('should have required columns', () => {
      const columns = Object.keys(userCourses);
      expect(columns).toContain('userId');
      expect(columns).toContain('courseId');
      expect(columns).toContain('createdAt');
    });
  });
});
