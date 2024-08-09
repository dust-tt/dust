-- Migration created on Aug 08, 2024
CREATE UNIQUE INDEX "vaults_workspace_id_name" ON "vaults" ("workspaceId", "name");
