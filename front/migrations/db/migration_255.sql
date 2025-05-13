-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "group_vaults_workspace_id_group_id" ON "group_vaults" ("workspaceId", "groupId");
