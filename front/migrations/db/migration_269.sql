-- Migration created on May 15, 2025
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "lastError" TEXT DEFAULT NULL;
