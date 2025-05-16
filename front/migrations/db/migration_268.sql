-- Migration created on May 14, 2025
CREATE INDEX CONCURRENTLY "labs_transcripts_configurations_workspace_id_provider" ON "labs_transcripts_configurations" ("workspaceId", "provider");
CREATE INDEX CONCURRENTLY "labs_transcripts_configurations_workspace_id_user_id" ON "labs_transcripts_configurations" ("workspaceId", "userId");
