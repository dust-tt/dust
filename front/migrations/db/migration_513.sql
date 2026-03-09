-- Migration created on Feb 16, 2026
CREATE INDEX CONCURRENTLY IF NOT EXISTS "files_workspace_id_use_case_status_"
    ON "files" ("workspaceId", "useCase", "status", ("useCaseMetadata" #>> '{spaceId}'));
