-- Migration created on Jan 02, 2026
CREATE INDEX "idx_agent_skills_workspace_custom_skill" ON "agent_skills" ("workspaceId", "customSkillId") WHERE "customSkillId" IS NOT NULL;
CREATE INDEX "idx_agent_skills_workspace_global_skill" ON "agent_skills" ("workspaceId", "globalSkillId") WHERE "globalSkillId" IS NOT NULL;
CREATE INDEX "idx_conversation_skills_workspace_conv_custom_skill" ON "conversation_skills" ("workspaceId", "conversationId", "customSkillId") WHERE "customSkillId" IS NOT NULL;
CREATE INDEX "idx_conversation_skills_workspace_conv_global_skill" ON "conversation_skills" ("workspaceId", "conversationId", "globalSkillId") WHERE "globalSkillId" IS NOT NULL;
