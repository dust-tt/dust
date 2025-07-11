-- Migration created on Jul 08, 2025
ALTER TABLE "public"."agent_step_contents" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "public"."agent_mcp_actions" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

-- Drop the old index and create a new one without the UNIQUE constraint.
DROP INDEX agent_step_contents_agent_message_id_step_index_in_step;
CREATE INDEX CONCURRENTLY agent_step_contents_agent_message_id_step_index_in_step ON agent_step_contents ("agentMessageId", "step", "index");
CREATE UNIQUE INDEX CONCURRENTLY "agent_step_contents_agent_message_id_step_index_versioned" ON "agent_step_contents" ("agentMessageId", "step", "index", "version");
