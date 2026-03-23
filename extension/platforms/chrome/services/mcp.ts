import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import logger from "@app/logger/logger";
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
  private captureService: CaptureService | null = null;
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

  constructor() {
    super();
  }

  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
  }

  private createServerForWorkspace(workspaceId: string): McpServer | null {
    try {
      const server = new McpServer(
        {
          name: "chrome-mcp-server",
          version: "1.0.0",
        },
        {
          instructions:
            "You are running inside a Dust Chrome extension. " +
            "The user is actively browsing the web, so their questions often relate to content on their current browser tab. " +
            "When the user's message implicitly or explicitly refers to a page, article, document, or 'this' / 'it' / 'the page' without further specification, " +
            "proactively call `get-current-browser-page` to fetch the page title, URL, and text content before answering. " +
            "For pages that are visual or non-text (images, PDFs, dashboards), call `get-current-browser-page-view` instead — it will attach the file directly when possible. " +
            "Do not ask the user to paste the content themselves — retrieve it directly with the available tools.",
        }
      );

      registerAllTools(server, this.captureService, workspaceId);

      return server;
    } catch (error) {
      logger.error({ err: error }, "Error creating MCP server.");
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
        "dust-chrome-extension",
        (serverId) => {
          this.serverId = serverId;
          onServerIdReceived(serverId);
        }
      );

      await server.connect(transport);

      this.server = server;
      this.transport = transport;
    } catch (error) {
      logger.error({ err: error }, "Failed to connect MCP server.");
      throw error;
    }
  }

  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      if (this.server && this.transport) {
        return { server: this.server, serverId: this.serverId };
      }

      const server = this.createServerForWorkspace(owner.sId);
      if (!server) {
        return { server: null, serverId: undefined };
      }

      await this.connectServer(server, owner, onServerIdReceived);
      return { server: this.server, serverId: this.serverId };
    } catch (error) {
      logger.error({ err: error }, "Error getting or creating MCP server.");
      return { server: null, serverId: undefined };
    }
  }

  getServerId(): string | undefined {
    return this.serverId;
  }

  async disconnect(): Promise<void> {
    const transport = this.transport;
    this.transport = null;
    this.server = null;
    this.serverId = undefined;
    if (transport) {
      await transport.close();
    }
  }
}
