-- Migration created on Apr 16, 2026
-- Create sandbox_mcp_actions table for sandbox-originated MCP tool calls
-- that require user approval. Separates these from agent_mcp_actions to
-- avoid the race condition on agent_step_contents unique index.

CREATE TABLE IF NOT EXISTS "sandbox_mcp_actions"
(
    "id"                       BIGSERIAL PRIMARY KEY,
    "createdAt"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"                TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "workspaceId"              BIGINT                   NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMessageId"           BIGINT                   NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "step"                     INTEGER                  NOT NULL,
    "status"                   VARCHAR(255)             NOT NULL DEFAULT 'blocked_validation_required',
    "mcpServerConfigurationId" VARCHAR(255)             NOT NULL,
    "toolConfiguration"        JSONB                    NOT NULL DEFAULT '{}',
    "augmentedInputs"          JSONB                    NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS "sandbox_mcp_action_ws_msg_status"
    ON "sandbox_mcp_actions" ("workspaceId", "agentMessageId", "status");

CREATE INDEX IF NOT EXISTS "sandbox_mcp_actions_agent_message_id"
    ON "sandbox_mcp_actions" ("agentMessageId");
