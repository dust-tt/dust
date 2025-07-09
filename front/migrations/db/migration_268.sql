-- Migration created on May 20, 2025
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "sharedSecret" DROP NOT NULL;ALTER TABLE "remote_mcp_servers" ALTER COLUMN "sharedSecret" DROP DEFAULT;ALTER TABLE "remote_mcp_servers" ALTER COLUMN "sharedSecret" TYPE VARCHAR(255);
