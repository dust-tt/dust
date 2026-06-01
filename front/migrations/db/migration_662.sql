-- Migration created on Jun 01, 2026
CREATE INDEX CONCURRENTLY "workspaces_name" ON "workspaces" ("name");
