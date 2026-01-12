-- Migration created on Jan 09, 2026
CREATE TABLE IF NOT EXISTS "user_tool_approvals" (
    "createdAt" timestamp WITH time zone NOT NULL,
    "updatedAt" timestamp WITH time zone NOT NULL,
    "mcpServerId" varchar(255) NOT NULL,
    "toolName" varchar(255) NOT NULL,
    "agentId" varchar(255) DEFAULT NULL,
    "argsAndValues" jsonb DEFAULT NULL,
    "id" bigserial,
    "userId" bigint NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "user_tool_approvals_unique_idx" ON "user_tool_approvals" ("workspaceId", "userId", "mcpServerId", "toolName", "agentId", "argsAndValues");
CREATE INDEX CONCURRENTLY "user_tool_approvals_workspace_id_user_id" ON "user_tool_approvals" ("workspaceId", "userId");
