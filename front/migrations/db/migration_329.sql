-- Migration created on Aug 02, 2025
CREATE TABLE
    IF NOT EXISTS "conversation_mcp_server_views" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "mcpServerViewId" BIGINT NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "enabled" BOOLEAN NOT NULL DEFAULT true,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

CREATE UNIQUE INDEX "conversation_mcp_server_views_conversation_mcp_server_view_id" ON "conversation_mcp_server_views" (
    "workspaceId",
    "conversationId",
    "mcpServerViewId"
);

CREATE INDEX "conversation_mcp_server_views_workspace_conversation_idx" ON "conversation_mcp_server_views" ("workspaceId", "conversationId");