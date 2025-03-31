import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import dataSourceUtilsServer from "@app/lib/actions/mcp_internal_actions/data_source_utils";
import helloWorldServer from "@app/lib/actions/mcp_internal_actions/helloworld";
import type { Authenticator } from "@app/lib/auth";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";

const INTERNAL_MCP_SERVERS: Record<
  InternalMCPServerNameType,
  {
    id: number;
    createServer: (auth: Authenticator, mcpServerId: string) => McpServer;
  }
> = {
  helloworld: {
    id: 1,
    createServer: helloWorldServer,
  },
  "data-source-utils": {
    id: 2,
    createServer: dataSourceUtilsServer,
  },
};

export type InternalMCPServerNameType =
  (typeof AVAILABLE_INTERNAL_MCPSERVER_NAMES)[number];

export const getInternalMCPServerSId = (
  auth: Authenticator,
  {
    internalMCPServerName,
  }: { internalMCPServerName: InternalMCPServerNameType }
): string =>
  makeSId("internal_mcp_server", {
    id: INTERNAL_MCP_SERVERS[internalMCPServerName].id,
    workspaceId: auth.getNonNullableWorkspace().id,
  });

const getInternalMCPServerName = (sId: string): InternalMCPServerNameType => {
  const sIdParts = getResourceNameAndIdFromSId(sId);

  if (!sIdParts) {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  if (sIdParts.resourceName !== "internal_mcp_server") {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  // Swap keys and values.
  const details = Object.entries(INTERNAL_MCP_SERVERS).find(
    ([, internalMCPServer]) => internalMCPServer.id === sIdParts.resourceId
  );

  if (!details) {
    throw new Error(`Invalid internal MCPServer sId: ${sId}`);
  }

  return details[0] as InternalMCPServerNameType;
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator
): Promise<McpServer> => {
  const internalMCPServerName = getInternalMCPServerName(mcpServerId);

  const { createServer } = INTERNAL_MCP_SERVERS[internalMCPServerName];
  const server = createServer(auth, mcpServerId);

  if (!server) {
    throw new Error(
      `Internal MCPServer not found for id ${internalMCPServerName}`
    );
  }

  await server.connect(transport);

  return server;
};
