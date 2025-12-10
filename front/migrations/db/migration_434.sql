-- Migration created on Dec 10, 2025
CREATE TABLE IF NOT EXISTS "agent_message_skills" (
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
  "agentConfigurationId" BIGINT NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "customSkillId" BIGINT REFERENCES "skill_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "globalSkillId" VARCHAR(255),
  "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "conversationId" BIGINT NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "source" "public"."enum_agent_message_skills_source" NOT NULL,
  "addedByUserId" BIGINT REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "id" BIGSERIAL,
  PRIMARY KEY ("id")
);g

CREATE INDEX "agent_message_skills_wid_cid_acid_active" ON "agent_message_skills" (
  "workspaceId",
  "conversationId",
  "agentConfigurationId",
  "isActive"
);