-- Migration created on Oct 21, 2025
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "startDateMs" INTEGER;
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "endDateMs" INTEGER;
