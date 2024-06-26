-- Migration created on Jun 26, 2024
CREATE TABLE IF NOT EXISTS "agent_code_interpreter_configurations" ("id"  SERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "sId" VARCHAR(255) NOT NULL, "name" VARCHAR(255), "description" TEXT, "runtypeEnvironment" VARCHAR(255) NOT NULL, "agentConfigurationId" INTEGER NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE UNIQUE INDEX "agent_code_interpreter_configurations_s_id" ON "agent_code_interpreter_configurations" ("sId");
CREATE INDEX CONCURRENTLY "agent_code_interpreter_configurations_agent_configuration_id" ON "agent_code_interpreter_configurations" ("agentConfigurationId");
CREATE TABLE IF NOT EXISTS "agent_code_interpreter_actions" ("id"  SERIAL , "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL, "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL, "runId" VARCHAR(255), "codeInterpreterConfigurationId" VARCHAR(255) NOT NULL, "query" TEXT NOT NULL, "output" JSONB, "functionCallId" VARCHAR(255), "functionCallName" VARCHAR(255), "step" INTEGER NOT NULL, "agentMessageId" INTEGER NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE, PRIMARY KEY ("id"));
CREATE INDEX CONCURRENTLY "agent_code_interpreter_actions_agent_message_id" ON "agent_code_interpreter_actions" ("agentMessageId");


