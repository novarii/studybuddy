CREATE TABLE "ai"."course_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"source_key" text NOT NULL,
	"source_type" text NOT NULL,
	"document_id" uuid,
	"slide_number" integer,
	"lecture_id" uuid,
	"start_seconds" real,
	"end_seconds" real,
	"content_preview" text,
	"title" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai"."message_source_refs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" text NOT NULL,
	"session_id" uuid NOT NULL,
	"course_source_id" uuid NOT NULL,
	"chunk_number" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ai"."message_source_refs" ADD CONSTRAINT "message_source_refs_course_source_id_course_sources_id_fk" FOREIGN KEY ("course_source_id") REFERENCES "ai"."course_sources"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_course_sources_course_id" ON "ai"."course_sources" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_course_sources_unique" ON "ai"."course_sources" USING btree ("course_id","source_key");--> statement-breakpoint
CREATE INDEX "idx_message_source_refs_message_id" ON "ai"."message_source_refs" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_source_refs_session_id" ON "ai"."message_source_refs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_message_source_refs_course_source_id" ON "ai"."message_source_refs" USING btree ("course_source_id");