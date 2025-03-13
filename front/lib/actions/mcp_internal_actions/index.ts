import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { MCPServerConfigurationType } from "@app/lib/actions/mcp";
import { assertNever } from "@app/types";

import { createServer as createHelloWorldServer } from "./helloworld";

export const connectToInternalMCPServer = async (
  internalMCPServerId: Exclude<
    MCPServerConfigurationType["internalMCPServerId"],
    null
  >,
  transport: InMemoryTransport
): Promise<McpServer> => {
  let server: McpServer | null = null;
  switch (internalMCPServerId) {
    case "helloworld":
      server = createHelloWorldServer();
      break;
    default:
      assertNever(internalMCPServerId);
  }

  if (!server) {
    throw new Error(
      `Internal MCPServer not found for id ${internalMCPServerId}`
    );
  }

  await server.connect(transport);

  return server;
};
