-- Migration created on Mar 19, 2025
CREATE TABLE IF NOT EXISTS "remote_mcp_servers" (
    "createdAt" timestamp with time zone NOT NULL,
    "updatedAt" timestamp with time zone NOT NULL,
    "sId" varchar(255) NOT NULL,
    "name" varchar(255) NOT NULL,
    "url" varchar(255) NOT NULL,
    "description" text,
    "cachedTools" varchar(255)[] DEFAULT ARRAY[] ::varchar(255)[],
    "lastSyncAt" timestamp with time zone,
    "sharedSecret" varchar(255) NOT NULL,
    "workspaceId" bigint NOT NULL REFERENCES "workspaces" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    "id" bigserial,
    "spaceId" bigint NOT NULL REFERENCES "vaults" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    PRIMARY KEY ("id")
);

ALTER TABLE "public"."agent_mcp_server_configurations"
    ADD COLUMN "remoteMCPServerId" bigint REFERENCES "remote_mcp_servers" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

