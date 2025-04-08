-- Migration created on Apr 08, 2025
CREATE TABLE IF NOT EXISTS "remote_mcp_server_tool_metadata" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "serverId" integer NOT NULL REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "toolName" varchar(255) NOT NULL,
    "permission" varchar(255) NOT NULL,
    "id" bigserial,
    PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "remote_mcp_server_tool_metadata_server_id_tool_name" ON "remote_mcp_server_tool_metadata" ("serverId", "toolName");
