-- Migration created on Apr 07, 2025
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "cachedName" VARCHAR(255) NOT NULL DEFAULT 'mcp';
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "cachedDescription" TEXT NOT NULL DEFAULT 'Call a tool to answer a question.';