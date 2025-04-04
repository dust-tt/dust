-- Migration created on Apr 04, 2025
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "icon" VARCHAR(255) NOT NULL DEFAULT 'rocket';
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "version" VARCHAR(255) NOT NULL DEFAULT '1.0.0';
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "authorization" JSONB DEFAULT NULL;

ALTER TABLE "public"."remote_mcp_servers" DROP COLUMN "deletedAt";
