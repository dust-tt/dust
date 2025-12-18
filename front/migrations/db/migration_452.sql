-- Migration created on Dec 17, 2025
ALTER TABLE "conversation_skills"
    DROP CONSTRAINT IF EXISTS "conversation_skills_agentConfigurationId_fkey";
ALTER TABLE "conversation_skills"
    ALTER COLUMN "agentConfigurationId" TYPE VARCHAR(255);
ALTER TABLE "agent_message_skills"
    DROP CONSTRAINT IF EXISTS "agent_message_skills_agentConfigurationId_fkey";
ALTER TABLE "agent_message_skills"
    ALTER COLUMN "agentConfigurationId" TYPE VARCHAR(255);
