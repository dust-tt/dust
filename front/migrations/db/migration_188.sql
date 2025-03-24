-- Migration created on Mar 24, 2025
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "deletedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE "public"."remote_mcp_servers" ADD COLUMN "vaultId" BIGINT NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "remote_mcp_servers" 
    DROP COLUMN "cachedTools",
    ADD COLUMN "cachedTools" jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN "remote_mcp_servers"."cachedTools" IS 'Array of objects with format: [{name: string, description: string}]';
