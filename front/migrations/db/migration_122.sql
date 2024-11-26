-- First drop the column
ALTER TABLE "agent_message_feedbacks" DROP COLUMN "agentConfigurationId";
ALTER TABLE "agent_message_feedbacks" ADD COLUMN "agentConfigurationId" VARCHAR(255);
ALTER TABLE "agent_message_feedbacks" ADD COLUMN "agentConfigurationVersion" INTEGER;
