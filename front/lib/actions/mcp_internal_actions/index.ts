import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { AVAILABLE_INTERNAL_MCPSERVER_NAMES } from "@app/lib/actions/mcp_internal_actions/constants";
import dataSourceUtilsServer from "@app/lib/actions/mcp_internal_actions/data_source_utils";
import helloWorldServer from "@app/lib/actions/mcp_internal_actions/helloworld";
import type { Authenticator } from "@app/lib/auth";
import { getResourceNameAndIdFromSId } from "@app/lib/resources/string_ids";
import type { ModelId, Result } from "@app/types";
import { Err, Ok } from "@app/types";

export const INTERNAL_MCP_SERVERS: Record<
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

const getInternalMCPServerNameAndWorkspaceId = (
  sId: string
): Result<
  {
    name: InternalMCPServerNameType;
    workspaceId: ModelId;
  },
  Error
> => {
  const sIdParts = getResourceNameAndIdFromSId(sId);

  if (!sIdParts) {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  if (sIdParts.resourceName !== "internal_mcp_server") {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  // Swap keys and values.
  const details = Object.entries(INTERNAL_MCP_SERVERS).find(
    ([, internalMCPServer]) => internalMCPServer.id === sIdParts.resourceId
  );

  if (!details) {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  if (!isInternalMCPServerName(details[0])) {
    return new Err(new Error(`Invalid internal MCPServer sId: ${sId}`));
  }

  const name: InternalMCPServerNameType = details[0];

  return new Ok({
    name,
    workspaceId: sIdParts.workspaceId,
  });
};

const isInternalMCPServerName = (
  name: string
): name is InternalMCPServerNameType =>
  AVAILABLE_INTERNAL_MCPSERVER_NAMES.includes(
    name as InternalMCPServerNameType
  );

export const isValidInternalMCPServerId = (
  auth: Authenticator,
  sId: string
): boolean => {
  const r = getInternalMCPServerNameAndWorkspaceId(sId);
  if (r.isOk()) {
    return r.value.workspaceId === auth.getNonNullableWorkspace().id;
  }

  return false;
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator
): Promise<McpServer> => {
  let internalMCPServerName: InternalMCPServerNameType;

  const r = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
  if (r.isOk()) {
    internalMCPServerName = r.value.name;
  } else {
    throw new MCPServerNotFoundError(
      `Internal MCPServer not found for id ${mcpServerId}`
    );
  }

  const { createServer } = INTERNAL_MCP_SERVERS[internalMCPServerName];
  const server = createServer(auth, mcpServerId);

  await server.connect(transport);

  return server;
};
