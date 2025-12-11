-- Migration created on Dec 11, 2025
ALTER TABLE "public"."agent_message_skills" DROP COLUMN "isActive";
CREATE INDEX "agent_message_skills_wid_cid_acid" ON "agent_message_skills" ("workspaceId", "conversationId", "agentConfigurationId");
