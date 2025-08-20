-- Migration created on Jan 15, 2025
-- Add runningState field to agent_mcp_actions table to track execution status

-- Add the runningState column with default value
ALTER TABLE "public"."agent_mcp_actions" 
ADD COLUMN "runningState" VARCHAR(20) NOT NULL DEFAULT 'not_started';

-- Add validation constraint to ensure only valid values are allowed
ALTER TABLE "public"."agent_mcp_actions" 
ADD CONSTRAINT "check_agent_mcp_action_running_state" 
CHECK ("runningState" IN ('not_started', 'running', 'completed', 'failed', 'cancelled'));

-- Update existing actions: mark actions older than 1 day as completed
-- This assumes that actions created more than 1 day ago have finished executing
UPDATE "public"."agent_mcp_actions" 
SET "runningState" = 'completed' 
WHERE "createdAt" < NOW() - INTERVAL '1 day';

-- Mark actions with errors as failed
UPDATE "public"."agent_mcp_actions" 
SET "runningState" = 'failed' 
WHERE "isError" = true AND "runningState" != 'completed';

-- Add index for efficient querying by running state
CREATE INDEX CONCURRENTLY "agent_mcp_action_running_state_idx" 
ON "public"."agent_mcp_actions" ("workspaceId", "runningState");

-- Add index for querying running actions specifically (common use case)
CREATE INDEX CONCURRENTLY "agent_mcp_action_running_idx" 
ON "public"."agent_mcp_actions" ("runningState") 
WHERE "runningState" = 'running';
