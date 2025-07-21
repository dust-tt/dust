-- Migration created on Jul 16, 2025
-- Add 'error' as a valid type for agent_step_contents


ALTER TABLE "public"."agent_step_contents" 
DROP CONSTRAINT IF EXISTS "agent_step_contents_type_check";

ALTER TABLE "public"."agent_step_contents" 
ADD CONSTRAINT "agent_step_contents_type_check" 
CHECK ("type" IN ('text_content', 'reasoning', 'function_call', 'error'));