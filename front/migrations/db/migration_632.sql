-- Migration created on mai 11, 2026
CREATE TABLE IF NOT EXISTS "agent_step_content_tool_executions" (
    "id" bigserial,
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "conversationId" bigint NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMessageId" bigint NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMCPActionId" bigint NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "stepContentId" bigint NOT NULL REFERENCES "agent_step_contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "agent_sc_te_workspace_action" ON "agent_step_content_tool_executions" ("workspaceId", "agentMCPActionId");
CREATE INDEX CONCURRENTLY "agent_sc_te_workspace_step_content" ON "agent_step_content_tool_executions" ("workspaceId", "stepContentId");
CREATE INDEX CONCURRENTLY "agent_sc_te_workspace_conversation_message" ON "agent_step_content_tool_executions" ("workspaceId", "conversationId", "agentMessageId");