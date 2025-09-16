import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import type { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import { isDustDeepDisabledByAdmin } from "@app/lib/api/assistant/global_agents/configurations/dust/utils";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

export const isEnabledForWorkspace = async (
  auth: Authenticator,
  name: InternalMCPServerNameType
): Promise<boolean> => {
  const mcpServer = INTERNAL_MCP_SERVERS[name];

  // If the server has a restriction, check if the restrictions are met.
  if (mcpServer.isRestricted) {
    const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
    const plan = auth.getNonNullablePlan();
    const isDustDeepDisabled = await isDustDeepDisabledByAdmin(auth);

    return !mcpServer.isRestricted({
      plan,
      featureFlags,
      isDustDeepDisabled,
    });
  }

  // If the server has no restriction, it is available by default.
  return true;
};

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryWithAuthTransport,
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
