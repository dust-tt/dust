-- Migration created on Oct 27, 2025
ALTER TABLE "agent_message_feedbacks" ADD COLUMN "dismissed" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX CONCURRENTLY "agent_message_feedbacks_dismissed_agent_configuration_id" ON "agent_message_feedbacks" ("dismissed", "agentConfigurationId");