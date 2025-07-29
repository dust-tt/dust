-- Migration created on Jul 29, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "citationsAllocated" INTEGER NOT NULL DEFAULT 0;