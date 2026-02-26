import type { DustAPI } from "@dust-tt/client";
import { DustMcpServerTransport } from "@dust-tt/client";
import { registerAllTools } from "@extension/platforms/chrome/tools";
import { McpService } from "@extension/shared/services/mcp";
import type { BrowserMessagingService } from "@extension/shared/services/platform";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Chrome-specific implementation of the MCP service.
 * Tools use the browser messaging service to communicate with the background script.
 */
export class ChromeMcpService extends McpService {
  private messaging: BrowserMessagingService | null;
  private server: McpServer | null = null;
  private transport: DustMcpServerTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor(messaging?: BrowserMessagingService) {
    super();
    this.messaging = messaging ?? null;
  }

  createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer({
        name: "chrome-mcp-server",
        version: "1.0.0",
      });

      registerAllTools(server, this.messaging);

      this.server = server;
      return server;
    } catch (error) {
      console.error("Error creating MCP server:", error);
      return null;
    }
  }

  async connectServer(
    server: McpServer,
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    try {
      if (this.transport) {
        return;
      }

      const transport = new DustMcpServerTransport(dustAPI, (serverId) => {
        this.serverId = serverId;
        onServerIdReceived(serverId);
      });

      await server.connect(transport);

      this.transport = transport;
    } catch (error) {
      console.error("Failed to connect MCP server:", error);
      throw error;
    }
  }

  async getOrCreateServer(
    dustAPI: DustAPI,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      if (this.server) {
        await this.connectServer(this.server, dustAPI, onServerIdReceived);
        return { server: this.server, serverId: this.serverId };
      }

      const server = this.createServerForWorkspace();
      if (!server) {
        return { server: null, serverId: undefined };
      }

      await this.connectServer(server, dustAPI, onServerIdReceived);
      return { server, serverId: this.serverId };
    } catch (error) {
      console.error("Error getting or creating MCP server:", error);
      return { server: null, serverId: undefined };
    }
  }

  getServerId(): string | undefined {
    return this.serverId;
  }

  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
  }
}
