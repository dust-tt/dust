import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import type { InMemoryWithAuthTransport } from "@app/lib/actions/mcp_internal_actions/in_memory_with_auth_transport";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";

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
