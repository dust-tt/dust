-- Migration created on May 12, 2025
CREATE UNIQUE INDEX CONCURRENTLY "labs_transcripts_histories_workspace_configuration_file_id" ON "labs_transcripts_histories" ("workspaceId", "configurationId", "fileId");
