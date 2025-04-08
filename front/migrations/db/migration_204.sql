-- Migration created on Apr 08, 2025
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedDescription" DROP NOT NULL;

ALTER TABLE "remote_mcp_servers" ALTER COLUMN "name" DROP DEFAULT;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "description" DROP DEFAULT;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "icon" DROP DEFAULT;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedName" DROP DEFAULT;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedDescription" DROP DEFAULT;