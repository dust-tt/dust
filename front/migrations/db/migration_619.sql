-- Migration created on May 4, 2026
ALTER TABLE "public"."project_todos"
    ALTER COLUMN "userId" DROP NOT NULL;
ALTER TABLE "public"."project_todo_versions"
    ALTER COLUMN "userId" DROP NOT NULL;
