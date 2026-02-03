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
