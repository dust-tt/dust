import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { default as dataSourceUtilsServer } from "@app/lib/actions/mcp_internal_actions/data_source_utils";
import { default as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/helloworld";
import { default as tableUtilsServer } from "@app/lib/actions/mcp_internal_actions/table_utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { assertNever } from "@app/types";

function getInternalMCPServer(
  auth: Authenticator,
  {
    internalMCPServerName,
    mcpServerId,
  }: {
    internalMCPServerName: InternalMCPServerNameType;
    mcpServerId: string;
  }
): McpServer {
  switch (internalMCPServerName) {
    case "helloworld":
      return helloWorldServer(auth, mcpServerId);
    case "data-source-utils":
      return dataSourceUtilsServer();
    case "table-utils":
      return tableUtilsServer();
    default:
      assertNever(internalMCPServerName);
  }
}

export const isEnabledForWorkspace = async (
  auth: Authenticator,
  name: InternalMCPServerNameType
): Promise<boolean> => {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

  const flag = INTERNAL_MCP_SERVERS[name].flag;
  if (!flag) {
    return true;
  }

  return featureFlags.includes(flag);
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator
): Promise<McpServer> => {
  const res = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
  if (res.isErr()) {
    throw new MCPServerNotFoundError(
      `Internal MCPServer not found for id ${mcpServerId}`
    );
  }
  const server = getInternalMCPServer(auth, {
    internalMCPServerName: res.value.name,
    mcpServerId,
  });

  await server.connect(transport);

  return server;
};
