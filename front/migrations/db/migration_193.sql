-- Migration created on Mar 27, 2025
ALTER TABLE "public"."agent_mcp_actions"
ADD COLUMN "mcpServerId" VARCHAR(255);

UPDATE "public"."agent_mcp_actions"
SET
    "mcpServerId" = 'missing-id';

ALTER TABLE "public"."agent_mcp_actions"
ALTER COLUMN "mcpServerId"
SET
    NOT NULL;