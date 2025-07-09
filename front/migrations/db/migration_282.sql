-- Migration created on Jun 12, 2025
ALTER TABLE "remote_mcp_servers"
ALTER COLUMN "sharedSecret" TYPE TEXT;