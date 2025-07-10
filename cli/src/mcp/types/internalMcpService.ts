import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import type { ServerInfo } from "./serverInfo.js";

/**
 * Abstract base class for internal MCP services
 * Integrates directly with Dust's API for internal agent capabilities
 */
export abstract class InternalMcpService {
  protected server: McpServer | null = null;
  protected serverInfo: ServerInfo;
  protected transport: DustMcpServerTransport | null = null;
  protected serverId: string | undefined = undefined;

  constructor(serverInfo: ServerInfo) {
    this.serverInfo = serverInfo;
  }
  /**
   * Create and connect to a server for a workspace
   * Primary method for workspace-scoped MCP implementation
   */
  async getOrCreateServer(
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    if (!this.server) {
      this.server = this.createMcpServer();
      if (!this.server) {
        return { server: null, serverId: undefined };
      }
    }

    try {
      await this.connectServer(this.server, dustAPI, onServerIdReceived);
      return {
        server: this.server,
        serverId: this.serverId,
      };
    } catch (error) {
      console.error("Error getting or creating filesystem MCP server:", error);
      return {
        server: null,
        serverId: undefined,
      };
    }
  }

  /**
   * Create an MCP server for filesystem operations
   */
  private createMcpServer(): McpServer | null {
    try {
      this.server = new McpServer(this.serverInfo);
      this.registerTools();
      return this.server;
    } catch (error) {
      console.error("Failed to create MCP Server: ", error);
      return null;
    }
  }

  /**
   * Connect the MCP server to a transport
   */
  private async connectServer(
    server: McpServer,
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    if (this.transport) {
      return;
    }

    try {
      const transport = new DustMcpServerTransport(
        dustAPI,
        (serverId) => {
          this.serverId = serverId;
          onServerIdReceived(serverId);
        },
        this.serverInfo.name
      );

      await server.connect(transport);
      this.transport = transport;
    } catch (error) {
      console.error("Failed to connect filesystem MCP server:", error);
      throw error;
    }
  }

  /**
   * Disconnect and clean up the current server connection
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }

  protected abstract registerTools(): void;
}
