-- Migration created on Feb 05, 2026
-- Creates the agent_mcp_app_sessions table for MCP Apps POC

CREATE TABLE IF NOT EXISTS "agent_mcp_app_sessions" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "sId" VARCHAR(255) NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "conversationId" VARCHAR(255) NOT NULL,
    "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMCPActionId" BIGINT NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "resourceUri" VARCHAR(255) NOT NULL,
    "csp" JSONB,
    "state" VARCHAR(255) NOT NULL DEFAULT 'active'
);

-- Indexes
CREATE UNIQUE INDEX CONCURRENTLY "agent_mcp_app_sessions_s_id" ON "agent_mcp_app_sessions" ("sId");
CREATE INDEX CONCURRENTLY "agent_mcp_app_sessions_workspace_conversation" ON "agent_mcp_app_sessions" ("workspaceId", "conversationId");
CREATE INDEX CONCURRENTLY "agent_mcp_app_sessions_workspace_agent_message" ON "agent_mcp_app_sessions" ("workspaceId", "agentMessageId");
CREATE INDEX CONCURRENTLY "agent_mcp_app_sessions_workspace_agent_mcp_action" ON "agent_mcp_app_sessions" ("workspaceId", "agentMCPActionId");
CREATE INDEX CONCURRENTLY "agent_mcp_app_sessions_agent_message_id" ON "agent_mcp_app_sessions" ("agentMessageId");
CREATE INDEX CONCURRENTLY "agent_mcp_app_sessions_agent_mcp_action_id" ON "agent_mcp_app_sessions" ("agentMCPActionId");
