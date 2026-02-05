CREATE TABLE "ai"."lectures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"panopto_session_id" text NOT NULL,
	"panopto_url" text,
	"stream_url" text,
	"title" text NOT NULL,
	"duration_seconds" integer,
	"chunk_count" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "ai"."user_lectures" (
	"user_id" text NOT NULL,
	"lecture_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_lectures_user_id_lecture_id_pk" PRIMARY KEY("user_id","lecture_id")
);
--> statement-breakpoint
ALTER TABLE "ai"."user_lectures" ADD CONSTRAINT "user_lectures_lecture_id_lectures_id_fk" FOREIGN KEY ("lecture_id") REFERENCES "ai"."lectures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lectures_course_session_idx" ON "ai"."lectures" USING btree ("course_id","panopto_session_id");--> statement-breakpoint
CREATE INDEX "idx_lectures_course_id" ON "ai"."lectures" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "idx_user_lectures_user_id" ON "ai"."user_lectures" USING btree ("user_id");