-- Migration created on Jun 09, 2026
ALTER TABLE "public"."agent_mcp_action_output_items" ADD COLUMN "generatedFilePath" TEXT DEFAULT NULL;
ALTER TABLE "public"."agent_mcp_action_output_items" ADD COLUMN "generatedFileContentType" TEXT DEFAULT NULL;
