-- Migration created on Aug 02, 2025
-- Copy over the name and description from the remote MCP server to the MCP server view if they were changed
ALTER TABLE "public"."mcp_server_views"
ALTER COLUMN "description" TYPE TEXT;

UPDATE "public"."mcp_server_views"
SET
    name = CASE
        WHEN rms.name IS NOT NULL
        AND rms.name != rms."cachedName" THEN rms.name
        ELSE mcp_server_views.name
    END,
    description = CASE
        WHEN rms.description IS NOT NULL
        AND rms.description != rms."cachedDescription" THEN rms.description
        ELSE mcp_server_views.description
    END
FROM
    "public"."remote_mcp_servers" rms
WHERE
    mcp_server_views."remoteMCPServerId" = rms.id;