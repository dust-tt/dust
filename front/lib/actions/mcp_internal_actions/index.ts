import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPServerNotFoundError } from "@app/lib/actions/mcp_errors";
import { getInternalMCPServerNameAndWorkspaceId } from "@app/lib/actions/mcp_internal_actions/constants";
import { getInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/servers";
import type { Authenticator } from "@app/lib/auth";
import type { AgentMessageType, ConversationType } from "@app/types";

export const connectToInternalMCPServer = async (
  mcpServerId: string,
  transport: InMemoryTransport,
  auth: Authenticator,
  conversation?: ConversationType,
  agentMessage?: AgentMessageType
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
    conversation,
    agentMessage,
  });

  await server.connect(transport);

  return server;
};
