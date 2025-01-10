-- Migration created on Nov 22, 2024
CREATE TABLE IF NOT EXISTS "agent_message_feedbacks" ("id"  SERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "workspaceId" INTEGER NOT NULL, "thumbDirection" VARCHAR(255), "content" TEXT, "agentConfigurationId" INTEGER REFERENCES "agent_configurations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "agentMessageId" INTEGER REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, "userId" INTEGER REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX "agent_message_feedbacks_agent_configuration_id" ON "agent_message_feedbacks" ("agentConfigurationId");
CREATE INDEX "agent_message_feedbacks_agent_message_id" ON "agent_message_feedbacks" ("agentMessageId");
CREATE INDEX "agent_message_feedbacks_user_id" ON "agent_message_feedbacks" ("userId");
CREATE UNIQUE INDEX "agent_message_feedbacks_agent_configuration_id_agent_message_id_user_id" ON "agent_message_feedbacks" ("agentConfigurationId", "agentMessageId", "userId");
