-- Migration created on Apr 15, 2026
ALTER TABLE "public"."compaction_messages" ADD COLUMN "runIds" VARCHAR(255)[];
