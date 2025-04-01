import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import type { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import dataSourceUtilsServer from "@app/lib/actions/mcp_internal_actions/data_source_utils";
import helloWorldServer from "@app/lib/actions/mcp_internal_actions/helloworld";
import type { Authenticator } from "@app/lib/auth";
import {
  getResourceNameAndIdFromSId,
  makeSId,
} from "@app/lib/resources/string_ids";
import type { ModelId } from "@app/types";

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

const getInternalMCPServerNameAndWorkspaceId = (
  sId: string
): {
  name: InternalMCPServerNameType;
  workspaceId: ModelId;
} => {
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

  return {
    name: details[0] as InternalMCPServerNameType,
    workspaceId: sIdParts.workspaceId,
  };
};

export const isValidInternalMCPServerId = (
  auth: Authenticator,
  sId: string
): boolean => {
  try {
    const { workspaceId } = getInternalMCPServerNameAndWorkspaceId(sId);
    return workspaceId === auth.getNonNullableWorkspace().id;
  } catch (e) {
    return false;
  }
};
export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator
): Promise<McpServer> => {
  let internalMCPServerName: InternalMCPServerNameType;
  try {
    const { name } = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
    internalMCPServerName = name;
  } catch (e) {
    throw new MCPServerNotFoundError(
      `Internal MCPServer not found for id ${mcpServerId}`
    );
  }

  const { createServer } = INTERNAL_MCP_SERVERS[internalMCPServerName];
  const server = createServer(auth, mcpServerId);

  await server.connect(transport);

  return server;
};
