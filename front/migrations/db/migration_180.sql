-- Migration created on Mar 13, 2025
CREATE TABLE
    IF NOT EXISTS "agent_mcp_server_configurations" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "sId" VARCHAR(255) NOT NULL,
            "serverType" VARCHAR(255) NOT NULL,
            "internalMCPServerId" VARCHAR(255),
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGINT,
            "agentConfigurationId" BIGINT NOT NULL REFERENCES "agent_configurations" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX CONCURRENTLY "agent_mcp_server_configurations_agent_configuration_id" ON "agent_mcp_server_configurations" ("agentConfigurationId");

CREATE UNIQUE INDEX CONCURRENTLY "agent_mcp_server_configurations_s_id" ON "agent_mcp_server_configurations" ("sId");

CREATE TABLE
    IF NOT EXISTS "agent_mcp_actions" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "mcpServerConfigurationId" VARCHAR(255) NOT NULL,
            "params" JSONB NOT NULL,
            "functionCallId" VARCHAR(255),
            "functionCallName" VARCHAR(255),
            "step" INTEGER NOT NULL,
            "executionState" VARCHAR(255) NOT NULL,
            "isError" BOOLEAN NOT NULL DEFAULT false,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGINT,
            "agentMessageId" BIGINT NOT NULL REFERENCES "agent_messages" ("id") ON DELETE NO ACTION ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX CONCURRENTLY "agent_mcp_actions_agent_message_id" ON "agent_mcp_actions" ("agentMessageId");

CREATE TABLE
    IF NOT EXISTS "agent_mcp_action_output_items" (
        "createdAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "updatedAt" TIMESTAMP
        WITH
            TIME ZONE NOT NULL,
            "content" JSONB NOT NULL,
            "workspaceId" BIGINT NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
            "id" BIGINT,
            "agentMCPActionId" BIGINT NOT NULL REFERENCES "agent_mcp_actions" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
            "fileId" BIGINT REFERENCES "files" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
            PRIMARY KEY ("id")
    );

CREATE INDEX CONCURRENTLY "agent_mcp_action_output_items_agent_m_c_p_action_id" ON "agent_mcp_action_output_items" ("agentMCPActionId");

CREATE INDEX CONCURRENTLY "agent_mcp_action_output_items_file_id" ON "agent_mcp_action_output_items" ("fileId");