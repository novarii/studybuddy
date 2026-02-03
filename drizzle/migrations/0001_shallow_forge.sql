CREATE TABLE "ai"."user_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"openrouter_key_encrypted" text NOT NULL,
	"openrouter_key_hash" text NOT NULL,
	"key_label" text,
	"credits_remaining" numeric,
	"credits_limit" numeric,
	"is_free_tier" boolean DEFAULT true,
	"connected_at" timestamp with time zone DEFAULT now(),
	"last_verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "user_api_keys_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE INDEX "idx_user_api_keys_user_id" ON "ai"."user_api_keys" USING btree ("user_id");