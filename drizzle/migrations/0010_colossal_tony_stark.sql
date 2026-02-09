DROP INDEX "ai"."idx_documents_checksum";--> statement-breakpoint
CREATE UNIQUE INDEX "idx_documents_user_checksum" ON "ai"."documents" USING btree ("user_id","checksum");