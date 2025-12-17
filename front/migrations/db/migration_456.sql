-- Make agentConfigurationId nullable in conversation_skills table
-- to support JIT skills that apply to all agents (agentConfigurationId = NULL)
ALTER TABLE "conversation_skills"
    ALTER COLUMN "agentConfigurationId" DROP NOT NULL;

-- Make agentConfigurationId nullable in agent_message_skills table
-- to support JIT skills that apply to all agents (agentConfigurationId = NULL)
ALTER TABLE "agent_message_skills"
    ALTER COLUMN "agentConfigurationId" DROP NOT NULL;
