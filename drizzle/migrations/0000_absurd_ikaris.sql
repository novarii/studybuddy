CREATE SCHEMA "ai";
--> statement-breakpoint
CREATE TABLE "ai"."chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "role_check" CHECK ("ai"."chat_messages"."role" IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE TABLE "ai"."chat_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."message_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"session_id" text NOT NULL,
	"source_id" text NOT NULL,
	"source_type" text NOT NULL,
	"chunk_number" integer NOT NULL,
	"content_preview" text,
	"document_id" uuid,
	"slide_number" integer,
	"lecture_id" uuid,
	"start_seconds" real,
	"end_seconds" real,
	"course_id" uuid,
	"owner_id" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai"."chat_messages" ADD CONSTRAINT "chat_messages_session_id_chat_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "ai"."chat_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_messages_session_id" ON "ai"."chat_messages" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_user_id" ON "ai"."chat_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_course_id" ON "ai"."chat_sessions" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_chat_sessions_updated_at" ON "ai"."chat_sessions" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_message_sources_message_id" ON "ai"."message_sources" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_sources_session_id" ON "ai"."message_sources" USING btree ("session_id");