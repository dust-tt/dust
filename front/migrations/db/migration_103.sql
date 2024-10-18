-- Migration created on Oct 14, 2024
CREATE INDEX CONCURRENTLY "partial_agent_config_active" ON "agent_configurations" ("workspaceId", "scope", "authorId")
WHERE
  "status" = 'active';