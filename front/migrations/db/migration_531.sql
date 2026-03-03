-- Add source and agentConfigurationId columns to conversation_mcp_server_views
ALTER TABLE "conversation_mcp_server_views"
    ADD COLUMN IF NOT EXISTS "source" VARCHAR(255) NOT NULL DEFAULT 'conversation',
    ADD COLUMN IF NOT EXISTS "agentConfigurationId" VARCHAR(255);

-- Partial unique index for conversation-scope tools (agentConfigurationId IS NULL)
CREATE UNIQUE INDEX CONCURRENTLY "idx_conversation_mcp_server_views_workspace_conv_mcp_view_null_agent"
    ON "conversation_mcp_server_views" ("workspaceId", "conversationId", "mcpServerViewId")
    WHERE "agentConfigurationId" IS NULL;

-- Partial unique index for agent-scope tools (agentConfigurationId IS NOT NULL)
CREATE UNIQUE INDEX CONCURRENTLY "idx_conversation_mcp_server_views_workspace_conv_mcp_view_agent"
    ON "conversation_mcp_server_views" ("workspaceId", "conversationId", "mcpServerViewId", "agentConfigurationId")
    WHERE "agentConfigurationId" IS NOT NULL;
