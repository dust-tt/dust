-- Migration created on Apr 04, 2025

-- Add new columns to the remote_mcp_servers table
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "icon" VARCHAR(255) NOT NULL DEFAULT 'rocket';
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "version" VARCHAR(255) NOT NULL DEFAULT '1.0.0';
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "authorization" JSONB DEFAULT NULL;

-- Update default value for name
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "name" SET DEFAULT 'mcp';

-- Update default value for description and set NOT NULL constraint
UPDATE "remote_mcp_servers" SET "description" = 'Call a tool to answer a question.' WHERE "description" IS NULL;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "remote_mcp_servers" ALTER COLUMN "description" SET DEFAULT 'Call a tool to answer a question.';
