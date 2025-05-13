-- Migration created on May 13, 2025
CREATE INDEX CONCURRENTLY "agent_configurations_workspace_id_author_id_s_id" ON "agent_configurations" ("workspaceId", "authorId", "sId");

