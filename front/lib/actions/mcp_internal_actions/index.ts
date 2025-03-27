import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import { createServer as helloWorldServer } from "@app/lib/actions/mcp_internal_actions/helloworld";

export type InternalMCPServerId =
  (typeof AVAILABLE_INTERNAL_MCPSERVER_IDS)[number];

export const connectToInternalMCPServer = async (
  internalMCPServerId: InternalMCPServerId,
  transport: InMemoryTransport
): Promise<McpServer> => {
  const server: McpServer = internalMCPServers[internalMCPServerId]();

  if (!server) {
    throw new Error(
      `Internal MCPServer not found for id ${internalMCPServerId}`
    );
  }

  await server.connect(transport);

  return server;
};

export const internalMCPServers: Record<InternalMCPServerId, () => McpServer> =
  {
    helloworld: helloWorldServer,
  };
