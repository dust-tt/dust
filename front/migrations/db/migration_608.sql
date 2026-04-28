-- Migration created on Apr 28, 2026
ALTER TABLE "public"."project_todos"
DROP COLUMN "cleanedAt";

ALTER TABLE "public"."project_todo_versions"
DROP COLUMN "cleanedAt";