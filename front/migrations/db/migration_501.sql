-- Migration created on Feb 02, 2026

-- Allow MCP server connections to be authenticated either via an OAuth connectionId
-- or via a stored credentials reference (credentialId). Exactly one must be set.

ALTER TABLE "mcp_server_connections"
    ADD COLUMN IF NOT EXISTS "credentialId" VARCHAR(255);

ALTER TABLE "mcp_server_connections"
    ALTER COLUMN "connectionId" DROP NOT NULL;

ALTER TABLE "mcp_server_connections"
    ADD CONSTRAINT "mcp_server_connections_auth_reference_check"
        CHECK (("connectionId" IS NOT NULL) <> ("credentialId" IS NOT NULL));
