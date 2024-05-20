-- Migration created on May 17, 2024
CREATE UNIQUE INDEX "labs_transcripts_configurations_user_id_workspace_id" ON "labs_transcripts_configurations" ("userId", "workspaceId")
