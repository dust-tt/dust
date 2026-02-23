import type { Authenticator } from "@app/lib/auth";
import type { MCPServerConnectionConnectionType } from "@app/lib/resources/mcp_server_connection_resource";
import { MCPServerConnectionResource } from "@app/lib/resources/mcp_server_connection_resource";
import type { RemoteMCPServerResource } from "@app/lib/resources/remote_mcp_servers_resource";
import { faker } from "@faker-js/faker";

export class MCPServerConnectionFactory {
  static async internal(
    auth: Authenticator,
    internalMCPServerId: string,
    connectionType: MCPServerConnectionConnectionType,
    createdAt?: Date
  ): Promise<MCPServerConnectionResource> {
    const connection = await MCPServerConnectionResource.makeNew(auth, {
      connectionId: "con_" + faker.string.alphanumeric(8),
      connectionType,
      serverType: "internal",
      internalMCPServerId,
      createdAt: createdAt ?? new Date(),
    });

    return connection;
  }

  static async remote(
    auth: Authenticator,
    remoteMCPServer: RemoteMCPServerResource,
    connectionType: MCPServerConnectionConnectionType,
    createdAt?: Date
  ): Promise<MCPServerConnectionResource> {
    const connection = await MCPServerConnectionResource.makeNew(auth, {
      connectionId: "con_" + faker.string.alphanumeric(8),
      connectionType,
      serverType: "remote",
      remoteMCPServerId: remoteMCPServer.id,
      createdAt: createdAt ?? new Date(),
    });

    return connection;
  }
}
