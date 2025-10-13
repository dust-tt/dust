-- Migration created on Sep 23, 2025
CREATE INDEX CONCURRENTLY "workspace_has_domains_workspace_id" ON "workspace_has_domains" ("workspaceId");
CREATE INDEX CONCURRENTLY "group_memberships_workspace_id" ON "group_memberships" ("workspaceId");
CREATE INDEX CONCURRENTLY "clones_workspace_id" ON "clones" ("workspaceId");
CREATE INDEX CONCURRENTLY "run_usages_workspace_id" ON "run_usages" ("workspaceId");
CREATE INDEX CONCURRENTLY "tracker_generations_workspace_id" ON "tracker_generations" ("workspaceId");
CREATE INDEX CONCURRENTLY "group_agents_workspace_id" ON "group_agents" ("workspaceId");
CREATE INDEX CONCURRENTLY "remote_mcp_servers_workspace_id" ON "remote_mcp_servers" ("workspaceId");
CREATE INDEX CONCURRENTLY "user_messages_workspace_id" ON "user_messages" ("workspaceId");
CREATE INDEX CONCURRENTLY "agent_messages_workspace_id" ON "agent_messages" ("workspaceId");
CREATE INDEX CONCURRENTLY "agent_message_feedbacks_workspace_id" ON "agent_message_feedbacks" ("workspaceId");
CREATE INDEX CONCURRENTLY "message_reactions_workspace_id" ON "message_reactions" ("workspaceId");

