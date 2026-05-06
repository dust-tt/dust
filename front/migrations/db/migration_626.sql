-- Migration created on mai 06, 2026
ALTER TABLE "public"."project_todo_states" DROP COLUMN IF EXISTS "lastCleanedAt";
