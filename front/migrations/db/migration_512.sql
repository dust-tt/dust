-- Migration created on Feb 16, 2026
ALTER TABLE "remote_mcp_servers"
  ALTER COLUMN "url" TYPE VARCHAR(2048);

ALTER TABLE "remote_mcp_servers"
  ALTER COLUMN "cachedName" TYPE VARCHAR(2048);
