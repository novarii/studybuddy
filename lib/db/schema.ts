import {
  pgSchema,
  uuid,
  text,
  timestamp,
  integer,
  real,
  index,
  check,
  numeric,
  boolean,
  jsonb,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const aiSchema = pgSchema('ai');

export const chatSessions = aiSchema.table(
  'chat_sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    courseId: uuid('course_id').notNull(),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    lastPromptTokens: integer('last_prompt_tokens'),
    summary: text('summary'),
    compactedAt: timestamp('compacted_at', { withTimezone: true }),
    compactedBeforeMessageId: uuid('compacted_before_message_id'),
  },
  (table) => [
    index('idx_chat_sessions_user_id').on(table.userId),
    index('idx_chat_sessions_course_id').on(table.courseId),
    index('idx_chat_sessions_updated_at').on(table.updatedAt),
  ]
);

export const chatMessages = aiSchema.table(
  'chat_messages',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => chatSessions.id, { onDelete: 'cascade' }),
    role: text('role').notNull(),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_chat_messages_session_id').on(table.sessionId),
    check('role_check', sql`${table.role} IN ('user', 'assistant')`),
  ]
);

export const messageSources = aiSchema.table(
  'message_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(),
    sessionId: text('session_id').notNull(),
    sourceId: text('source_id').notNull(),
    sourceType: text('source_type').notNull(),
    chunkNumber: integer('chunk_number').notNull(),
    contentPreview: text('content_preview'),
    documentId: uuid('document_id'),
    slideNumber: integer('slide_number'),
    lectureId: uuid('lecture_id'),
    startSeconds: real('start_seconds'),
    endSeconds: real('end_seconds'),
    courseId: uuid('course_id'),
    ownerId: text('owner_id'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_message_sources_message_id').on(table.messageId),
    index('idx_message_sources_session_id').on(table.sessionId),
  ]
);

export type ChatSession = typeof chatSessions.$inferSelect;
export type NewChatSession = typeof chatSessions.$inferInsert;

export type ChatMessage = typeof chatMessages.$inferSelect;
export type NewChatMessage = typeof chatMessages.$inferInsert;

export type MessageSource = typeof messageSources.$inferSelect;
export type NewMessageSource = typeof messageSources.$inferInsert;

// Deduplicated sources per course (shared across messages)
export const courseSources = aiSchema.table(
  'course_sources',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').notNull(),
    // Unique identifier for this source (e.g., "doc_xxx_slide_5" or "lec_xxx_120_180")
    sourceKey: text('source_key').notNull(),
    sourceType: text('source_type').notNull(), // 'slide' | 'lecture'
    // Document source fields
    documentId: uuid('document_id'),
    slideNumber: integer('slide_number'),
    // Lecture source fields
    lectureId: uuid('lecture_id'),
    startSeconds: real('start_seconds'),
    endSeconds: real('end_seconds'),
    // Shared metadata
    contentPreview: text('content_preview'),
    title: text('title'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_course_sources_course_id').on(table.courseId),
    uniqueIndex('idx_course_sources_unique').on(table.courseId, table.sourceKey),
  ]
);

// Lightweight join table linking messages to deduplicated sources
export const messageSourceRefs = aiSchema.table(
  'message_source_refs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    messageId: text('message_id').notNull(), // UUID stored as text for compatibility
    sessionId: uuid('session_id').notNull(),
    courseSourceId: uuid('course_source_id')
      .notNull()
      .references(() => courseSources.id, { onDelete: 'cascade' }),
    chunkNumber: integer('chunk_number').notNull(), // The [1], [2] citation number
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('idx_message_source_refs_message_id').on(table.messageId),
    index('idx_message_source_refs_session_id').on(table.sessionId),
    index('idx_message_source_refs_course_source_id').on(table.courseSourceId),
  ]
);

export type CourseSource = typeof courseSources.$inferSelect;
export type NewCourseSource = typeof courseSources.$inferInsert;

export type MessageSourceRef = typeof messageSourceRefs.$inferSelect;
export type NewMessageSourceRef = typeof messageSourceRefs.$inferInsert;

export const userApiKeys = aiSchema.table(
  'user_api_keys',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull().unique(),
    openrouterKeyEncrypted: text('openrouter_key_encrypted').notNull(),
    openrouterKeyHash: text('openrouter_key_hash').notNull(),
    keyLabel: text('key_label'),
    creditsRemaining: numeric('credits_remaining'),
    creditsLimit: numeric('credits_limit'),
    isFreeTier: boolean('is_free_tier').default(true),
    connectedAt: timestamp('connected_at', { withTimezone: true }).defaultNow(),
    lastVerifiedAt: timestamp('last_verified_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_user_api_keys_user_id').on(table.userId)]
);

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type NewUserApiKey = typeof userApiKeys.$inferInsert;

export const documents = aiSchema.table(
  'documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id').notNull(),
    courseId: uuid('course_id').notNull(),
    filename: text('filename').notNull(),
    checksum: text('checksum').notNull(),
    status: text('status').notNull().default('processing'),
    pageCount: integer('page_count'),
    uniquePageCount: integer('unique_page_count'),
    failedPages: jsonb('failed_pages').$type<number[]>(),
    errorMessage: text('error_message'),
    filePath: text('file_path').notNull(),
    processedFilePath: text('processed_file_path'),
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
  },
  (table) => [
    index('idx_documents_user_id').on(table.userId),
    index('idx_documents_course_id').on(table.courseId),
    uniqueIndex('idx_documents_checksum').on(table.checksum),
  ]
);

export type Document = typeof documents.$inferSelect;
export type NewDocument = typeof documents.$inferInsert;

export const lectures = aiSchema.table(
  'lectures',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    courseId: uuid('course_id').notNull(),

    // Panopto identification
    panoptoSessionId: text('panopto_session_id').notNull(),
    panoptoUrl: text('panopto_url'),
    streamUrl: text('stream_url'),

    // Content metadata (no file storage - only embeddings persist)
    title: text('title').notNull(),
    durationSeconds: integer('duration_seconds'),
    chunkCount: integer('chunk_count'),

    // Processing status
    // 'pending' | 'downloading' | 'transcribing' | 'chunking' | 'completed' | 'failed'
    status: text('status').notNull().default('pending'),
    errorMessage: text('error_message'),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    // Unique constraint: one lecture per course + panopto session
    uniqueIndex('lectures_course_session_idx').on(
      table.courseId,
      table.panoptoSessionId
    ),
    index('idx_lectures_course_id').on(table.courseId),
  ]
);

// Many-to-many: users can share access to lectures
export const userLectures = aiSchema.table(
  'user_lectures',
  {
    userId: text('user_id').notNull(),
    lectureId: uuid('lecture_id')
      .notNull()
      .references(() => lectures.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.lectureId] }),
    index('idx_user_lectures_user_id').on(table.userId),
  ]
);

export type Lecture = typeof lectures.$inferSelect;
export type NewLecture = typeof lectures.$inferInsert;

export type UserLecture = typeof userLectures.$inferSelect;
export type NewUserLecture = typeof userLectures.$inferInsert;

// Courses table - synced from CDCS catalog
export const courses = aiSchema.table(
  'courses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    code: text('code').notNull().unique(),
    title: text('title').notNull(),
    instructor: text('instructor'),
    isOfficial: boolean('is_official').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [index('idx_courses_code').on(table.code)]
);

// Many-to-many: users enrolled in courses
export const userCourses = aiSchema.table(
  'user_courses',
  {
    userId: text('user_id').notNull(), // Clerk ID directly - no users table needed
    courseId: uuid('course_id')
      .notNull()
      .references(() => courses.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.courseId] }),
    index('idx_user_courses_user_id').on(table.userId),
    index('idx_user_courses_course_id').on(table.courseId),
  ]
);

export type Course = typeof courses.$inferSelect;
export type NewCourse = typeof courses.$inferInsert;

export type UserCourse = typeof userCourses.$inferSelect;
export type NewUserCourse = typeof userCourses.$inferInsert;
