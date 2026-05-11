-- Migration created on mai 11, 2026
CREATE TABLE IF NOT EXISTS "agent_step_content_tool_executions" (
    "id" bigserial,
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "agentMCPActionId" bigint NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "stepContentId" bigint NOT NULL REFERENCES "agent_step_contents" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX CONCURRENTLY "agent_step_content_tool_executions_action" ON "agent_step_content_tool_executions" ("agentMCPActionId");

CREATE INDEX CONCURRENTLY "agent_step_content_tool_executions_step_content_id" ON "agent_step_content_tool_executions" ("stepContentId");

CREATE INDEX CONCURRENTLY "agent_step_content_tool_executions_workspace_id" ON "agent_step_content_tool_executions" ("workspaceId");
