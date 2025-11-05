-- Migration created on Nov 05, 2025
CREATE TABLE IF NOT EXISTS "agent_scheduled_executions" (
    "id" BIGSERIAL,
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "workspaceId" INTEGER NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "conversationId" INTEGER NOT NULL REFERENCES "conversations" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "userMessageId" INTEGER NOT NULL REFERENCES "messages" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "workflowId" TEXT NOT NULL,
    "delayMs" INTEGER NOT NULL,
    "scheduledFor" TIMESTAMP WITH TIME ZONE NOT NULL,
    "status" VARCHAR(255) NOT NULL DEFAULT 'scheduled',
    "error" TEXT,
    PRIMARY KEY ("id")
);

CREATE INDEX "agent_scheduled_executions_workspace_id" ON "agent_scheduled_executions" ("workspaceId");
CREATE INDEX "agent_scheduled_executions_conversation_id" ON "agent_scheduled_executions" ("conversationId");
CREATE INDEX "agent_scheduled_executions_agent_message_id" ON "agent_scheduled_executions" ("agentMessageId");
CREATE INDEX "agent_scheduled_executions_user_message_id" ON "agent_scheduled_executions" ("userMessageId");
CREATE INDEX "agent_scheduled_executions_workspace_id_conversation_id" ON "agent_scheduled_executions" ("workspaceId", "conversationId");
CREATE INDEX "agent_scheduled_executions_workspace_id_agent_message_id" ON "agent_scheduled_executions" ("workspaceId", "agentMessageId");
CREATE INDEX "agent_scheduled_executions_workspace_id_user_message_id" ON "agent_scheduled_executions" ("workspaceId", "userMessageId");
CREATE INDEX "agent_scheduled_executions_status" ON "agent_scheduled_executions" ("status");
CREATE INDEX "agent_scheduled_executions_scheduled_for" ON "agent_scheduled_executions" ("scheduledFor");
CREATE UNIQUE INDEX "agent_scheduled_executions_workflow_id" ON "agent_scheduled_executions" ("workflowId");
