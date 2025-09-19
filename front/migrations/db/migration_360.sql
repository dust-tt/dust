+-- Migration created on Sep 19, 2025
ALTER TABLE "public"."remote_mcp_servers"
ADD COLUMN IF NOT EXISTS "customHeaders" jsonb;
