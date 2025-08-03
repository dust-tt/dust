-- Migration created on Aug 02, 2025
CREATE TABLE
    IF NOT EXISTS "conversation_mcp_server_views" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            "mcpServerViewId" BIGINT NOT NULL REFERENCES "mcp_server_views" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            "userId" BIGINT NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            "enabled" BOOLEAN NOT NULL DEFAULT true,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGSERIAL,
            PRIMARY KEY ("id")
    );

SELECT
    i.relname AS name,
    ix.indisprimary AS primary,
    ix.indisunique AS unique,
    ix.indkey AS indkey,
    array_agg (a.attnum) as column_indexes,
    array_agg (a.attname) AS column_names,
    pg_get_indexdef (ix.indexrelid) AS definition
FROM
    pg_class t,
    pg_class i,
    pg_index ix,
    pg_attribute a
WHERE
    t.oid = ix.indrelid
    AND i.oid = ix.indexrelid
    AND a.attrelid = t.oid
    AND t.relkind = 'r'
    and t.relname = 'conversation_mcp_server_views'
GROUP BY
    i.relname,
    ix.indexrelid,
    ix.indisprimary,
    ix.indisunique,
    ix.indkey
ORDER BY
    i.relname;

CREATE UNIQUE INDEX "conversation_mcp_server_views_conversation_mcp_server_view_un" ON "conversation_mcp_server_views" ("conversationId", "mcpServerViewId");

CREATE INDEX "conversation_mcp_server_views_workspace_conversation_idx" ON "conversation_mcp_server_views" ("workspaceId", "conversationId");

CREATE INDEX "conversation_mcp_server_views_workspace_mcp_server_view_idx" ON "conversation_mcp_server_views" ("workspaceId", "mcpServerViewId");

CREATE INDEX "conversation_mcp_server_views_user_idx" ON "conversation_mcp_server_views" ("userId");