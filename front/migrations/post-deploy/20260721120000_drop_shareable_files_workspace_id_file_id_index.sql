/*
Old code upserts shareable_files with ON CONFLICT ("workspaceId", "fileId"); drop only once new
code (targeting ON CONFLICT ("fileId")) is live.
*/
SET SESSION statement_timeout = 1200000;
SET SESSION lock_timeout = 3000;
DROP INDEX CONCURRENTLY IF EXISTS "shareable_files_workspace_id_file_id";
