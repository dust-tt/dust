-- Migration created on Mar 27, 2026
-- Add persisted citations to MCP actions and output items (nullable for backfill).

ALTER TABLE "agent_mcp_action_output_items"
ADD COLUMN IF NOT EXISTS "citations" JSONB;

