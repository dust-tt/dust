-- Migration created on Jan 10, 2025
-- Create agent_step_contents table for new Chain of Thought v2 data model

CREATE TABLE IF NOT EXISTS "agent_step_contents" (
    "id" BIGSERIAL PRIMARY KEY,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "step" INTEGER NOT NULL,
    "index" INTEGER NOT NULL,
    "type" VARCHAR(255) NOT NULL CHECK ("type" IN ('text_content', 'reasoning', 'function_call')),
    "value" JSONB NOT NULL,
    "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Create composite unique index to ensure ordering integrity
CREATE UNIQUE INDEX "agent_step_contents_agent_message_id_step_index_in_step" 
    ON "agent_step_contents" ("agentMessageId", "step", "index");

-- Create index for querying by agent message
CREATE INDEX "agent_step_contents_agent_message_id_idx" 
    ON "agent_step_contents" ("agentMessageId");

-- Create index for workspace queries
CREATE INDEX "agent_step_contents_workspace_id_idx" 
    ON "agent_step_contents" ("workspaceId");

-- Create index for type filtering
CREATE INDEX "agent_step_contents_type_idx" 
    ON "agent_step_contents" ("type");