-- Migration to add queries field to agent_websearch_actions table
ALTER TABLE "agent_websearch_actions" ADD COLUMN IF NOT EXISTS "queries" TEXT[] DEFAULT '{}'::text[]; 