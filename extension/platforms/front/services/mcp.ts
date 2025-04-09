import { registerAllTools } from "@app/platforms/front/tools";
import { McpService } from "@app/shared/services/mcp";
import { DustMcpServerTransport } from "@app/shared/services/transport";
import type { DustAPI } from "@dust-tt/client";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Front-specific implementation of the MCP service
 * This implementation is entirely workspace-scoped
 */
export class FrontMcpService extends McpService {
  private frontContext: WebViewContext | null = null;
  private server: McpServer | null = null;
  private transport: DustMcpServerTransport | null = null;
  private serverUUID: string | undefined = undefined;

  constructor() {
    super();
  }

  /**
   * Set the Front context for sending comments
   * This needs to be called by the platform service constructor
   */
  setFrontContext(context: WebViewContext): void {
    this.frontContext = context;
  }

  /**
   * Create an MCP server for a workspace
   * This is the core implementation that creates the workspace-scoped server
   */
  createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer({
        name: "front-mcp-server",
        version: "1.0.0",
      });

      // Register all tools with the server.
      registerAllTools(server, this.frontContext);

      this.server = server;
      return server;
    } catch (error) {
      console.error("Error creating MCP server:", error);
      return null;
    }
  }

  /**
   * Connect the MCP server to a transport
   * This is required by the base class but our implementation is workspace-scoped
   */
  async connectServer(server: McpServer, dustAPI: DustAPI): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    try {
      // If we already have a transport for this workspace, reuse it.
      if (this.transport) {
        console.log("Transport already exists, reusing");
        return;
      }

      // Create our custom transport with workspace-scoped registration.
      const transport = new DustMcpServerTransport(dustAPI, this.serverUUID);

      // Save the server UUID for potential reconnections.
      this.serverUUID = transport.getServerId();

      // Connect the server to the transport.
      await server.connect(transport);

      // Store the transport for future reuse.
      this.transport = transport;
    } catch (error) {
      console.error("Failed to connect MCP server:", error);
      throw error;
    }
  }

  /**
   * Get or create an MCP server for the workspace
   * This is a convenience method that provides the main API for client code
   */
  async getOrCreateServer(
    dustAPI: DustAPI
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      // Reuse existing server if we have one
      if (this.server) {
        // Connect if not already connected
        await this.connectServer(this.server, dustAPI);
        return {
          server: this.server,
          serverId: this.serverUUID,
        };
      }

      // Create a new server if we don't have one
      const server = this.createServerForWorkspace();
      if (!server) {
        return {
          server: null,
          serverId: undefined,
        };
      }

      // Connect the server
      await this.connectServer(server, dustAPI);

      return {
        server: server,
        serverId: this.serverUUID,
      };
    } catch (error) {
      console.error("Error getting or creating MCP server:", error);
      return {
        server: null,
        serverId: undefined,
      };
    }
  }

  /**
   * Get the current server ID
   * This is useful for including in message payloads
   */
  getServerId(): string | undefined {
    return this.serverUUID;
  }

  /**
   * Disconnect and clean up the current server connection
   */
  async disconnect(): Promise<void> {
    if (this.transport) {
      await this.transport.close();
      this.transport = null;
    }
    // Note: We keep the serverUUID for potential reconnection
  }
}
