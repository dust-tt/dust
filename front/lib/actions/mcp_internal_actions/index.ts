import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import type { InternalMCPServerNameType } from "@app/lib/actions/mcp_internal_actions/constants";
import {
  getInternalMCPServerNameAndWorkspaceId,
  INTERNAL_MCP_SERVERS,
} from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type {
  AgentLoopListToolsContextType,
  AgentLoopRunContextType,
} from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";

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

export type ContextParams =
  | {
      agentLoopRunContext: AgentLoopRunContextType;
      agentLoopListToolsContext?: never;
    }
  | {
      agentLoopRunContext?: never;
      agentLoopListToolsContext: AgentLoopListToolsContextType;
    }
  | { agentLoopRunContext?: never; agentLoopListToolsContext?: never };

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator,
  contextParams: ContextParams
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
    contextParams.agentLoopRunContext,
    contextParams.agentLoopListToolsContext
  );

  await server.connect(transport);

  return server;
};
