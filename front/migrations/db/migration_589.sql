-- Migration created on Apr 17, 2026
ALTER TABLE project_todos ADD COLUMN "cleanedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE project_todo_versions ADD COLUMN "cleanedAt" TIMESTAMP WITH TIME ZONE;
