-- Migration created on Dec 11, 2025
DROP INDEX "agent_message_skills_wid_cid_acid_active";

CREATE UNIQUE INDEX CONCURRENTLY "agent_message_skills_wid_cid_acid_active" ON "agent_message_skills" (
  "workspaceId",
  "conversationId",
  "agentConfigurationId"
)
WHERE "isActive" = true;
