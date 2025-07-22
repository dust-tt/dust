-- Migration created on Jul 17, 2025
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "customHeaders" JSONB DEFAULT NULL; 