import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

export const isEnabledForWorkspace = async (
  auth: Authenticator,
  name: InternalMCPServerNameType
): Promise<boolean> => {
  const mcpServer = INTERNAL_MCP_SERVERS[name];
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());

  // If the server has a required feature flag, check if it is enabled.
  if (mcpServer.flag) {
    return featureFlags.includes(mcpServer.flag);
  }

  // If the server has a restriction, check if the restrictions are met.
  if (mcpServer.restriction) {
    const plan = auth.getNonNullablePlan();
    return mcpServer.restriction(plan, featureFlags);
  }

  // If the server has no restriction, it is available by default.
  return true;
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): Promise<McpServer> => {
  const res = getInternalMCPServerNameAndWorkspaceId(mcpServerId);
  if (res.isErr()) {
    throw new MCPServerNotFoundError(
      `Internal MCPServer not found for id ${mcpServerId}`
    );
  }
  const server = await getInternalMCPServer(
    auth,
    {
      internalMCPServerName: res.value.name,
      mcpServerId,
    },
    agentLoopContext
  );

  await server.connect(transport);

  return server;
};
