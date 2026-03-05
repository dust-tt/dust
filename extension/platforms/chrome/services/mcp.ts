import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import type { WorkspaceType } from "@app/types/user";
import { registerAllTools } from "@extension/platforms/chrome/tools";
import type { CaptureService } from "@extension/shared/services/capture";
import { McpService } from "@extension/shared/services/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Chrome-specific implementation of the MCP service.
 * Tools use the capture service to retrieve page content.
 */
export class ChromeMcpService extends McpService {
  private captureService: CaptureService | null;
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor(captureService?: CaptureService) {
    super();
    this.captureService = captureService ?? null;
  }

  createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer({
        name: "chrome-mcp-server",
        version: "1.0.0",
      });

      registerAllTools(server, this.captureService);

      this.server = server;
      return server;
    } catch (error) {
      console.error("Error creating MCP server:", error);
      return null;
    }
  }

  async connectServer(
    server: McpServer,
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    try {
      if (this.transport) {
        return;
      }

      const transport = new BrowserMCPTransport(
        owner.sId,
        "chrome-extension-client",
        (serverId) => {
          this.serverId = serverId;
          onServerIdReceived(serverId);
        }
      );

      await server.connect(transport);

      this.transport = transport;
    } catch (error) {
      console.error("Failed to connect MCP server:", error);
      throw error;
    }
  }

  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      if (this.server) {
        await this.connectServer(this.server, owner, onServerIdReceived);
        return { server: this.server, serverId: this.serverId };
      }

      const server = this.createServerForWorkspace();
      if (!server) {
        return { server: null, serverId: undefined };
      }

      await this.connectServer(server, owner, onServerIdReceived);
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
