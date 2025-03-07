-- Migration created on Mar 04, 2025
ALTER TABLE "public"."notion_connector_states" ADD COLUMN "notionWorkspaceId" VARCHAR(255);
