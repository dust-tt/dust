-- Migration created on May 5, 2026
ALTER TABLE "remote_mcp_servers"
  ADD COLUMN IF NOT EXISTS "meta" JSONB DEFAULT NULL;
