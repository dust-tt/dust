import type { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Implementation } from "@modelcontextprotocol/sdk/types.js";
import type { ComponentType } from "react";

import type { AVAILABLE_INTERNAL_MCPSERVER_IDS } from "@app/lib/actions/constants";
import { helloWorldServer } from "@app/lib/actions/mcp_internal_actions/helloworld";
import type { OAuthProvider, OAuthUseCase } from "@app/types";

export type InternalMCPServerId =
  (typeof AVAILABLE_INTERNAL_MCPSERVER_IDS)[number];

export type AuthorizationInfo = {
  provider: OAuthProvider;
  use_case: OAuthUseCase;
};

export type ServerInfo = Implementation & {
  authorization?: AuthorizationInfo;
};

export const connectToInternalMCPServer = async (
  internalMCPServerId: InternalMCPServerId,
  transport: InMemoryTransport
): Promise<McpServer> => {
  const server: McpServer =
    internalMCPServers[internalMCPServerId].createServer();

  if (!server) {
    throw new Error(
      `Internal MCPServer not found for id ${internalMCPServerId}`
    );
  }

  await server.connect(transport);

  return server;
};

export const internalMCPServers: Record<
  InternalMCPServerId,
  {
    createServer: () => McpServer;
    serverInfo: ServerInfo;
    icon: ComponentType;
  }
> = {
  helloworld: helloWorldServer,
};
