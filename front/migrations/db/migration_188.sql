-- Migration created on Mar 23, 2025
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedTools" DROP NOT NULL;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedTools" SET DEFAULT '[]';
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "cachedTools" TYPE JSONB;
