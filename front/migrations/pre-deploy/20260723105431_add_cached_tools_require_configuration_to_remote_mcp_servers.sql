/*
Statement 0
*/
SET SESSION statement_timeout = 3000;
SET SESSION lock_timeout = 3000;
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "cachedToolsRequireConfiguration" boolean DEFAULT false NOT NULL;
