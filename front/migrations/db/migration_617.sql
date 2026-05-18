-- Migration created on May 3, 2026
ALTER TABLE "public"."project_todos"
ADD COLUMN "agentInstructions" TEXT;

ALTER TABLE "public"."project_todo_versions"
ADD COLUMN "agentInstructions" TEXT;