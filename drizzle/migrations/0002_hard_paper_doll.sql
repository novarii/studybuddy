CREATE TABLE "ai"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"course_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"checksum" text NOT NULL,
	"status" text DEFAULT 'processing' NOT NULL,
	"page_count" integer,
	"unique_page_count" integer,
	"failed_pages" jsonb,
	"error_message" text,
	"file_path" text NOT NULL,
	"processed_file_path" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "idx_documents_user_id" ON "ai"."documents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_documents_course_id" ON "ai"."documents" USING btree ("course_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_documents_checksum" ON "ai"."documents" USING btree ("checksum");