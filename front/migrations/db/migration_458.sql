-- Migration created on Dec 29, 2025
CREATE INDEX "idx_skill_configuration_workspace_status" ON "skill_configurations" ("workspaceId", "status");
CREATE INDEX "idx_conversation_skills_workspace_conv_agent" ON "conversation_skills" ("workspaceId", "conversationId", "agentConfigurationId");
CREATE INDEX "idx_agent_message_skills_workspace_message" ON "agent_message_skills" ("workspaceId", "agentMessageId");
