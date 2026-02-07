ALTER TABLE "ai"."chat_sessions" ADD COLUMN "summary" text;--> statement-breakpoint
ALTER TABLE "ai"."chat_sessions" ADD COLUMN "compacted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ai"."chat_sessions" ADD COLUMN "compacted_before_message_id" uuid;