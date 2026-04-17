-- Migration created on Apr 16, 2026
ALTER TABLE project_todos
ADD COLUMN "deletedAt" TIMESTAMP
WITH
    TIME ZONE;

ALTER TABLE project_todo_versions
ADD COLUMN "deletedAt" TIMESTAMP
WITH
    TIME ZONE;