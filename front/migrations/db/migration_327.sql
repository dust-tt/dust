-- Migration created on Aug 02, 2025
ALTER TABLE "public"."remote_mcp_servers"
DROP COLUMN "name";

ALTER TABLE "public"."remote_mcp_servers"
DROP COLUMN "description";