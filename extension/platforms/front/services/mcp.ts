import { BrowserMCPTransport } from "@app/lib/client/BrowserMCPTransport";
import logger from "@app/logger/logger";
import type { WorkspaceType } from "@app/types/user";
import { registerAllTools } from "@extension/platforms/front/tools";
import { McpService } from "@extension/shared/services/mcp";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Front-specific implementation of the MCP service
 * This implementation is entirely workspace-scoped
 */
export class FrontMcpService extends McpService {
  private frontContext: WebViewContext | null = null;
  private server: McpServer | null = null;
  private transport: BrowserMCPTransport | null = null;
  private serverId: string | undefined = undefined;

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
  private createServerForWorkspace(): McpServer | null {
    try {
      const server = new McpServer(
        {
          name: "front-mcp-server",
          version: "1.0.0",
        },
        {
          instructions:
            "You are running inside a Dust plugin embedded in the Front customer support platform. " +
            "The user is working on email conversations in Front. " +
            "When the user's message implicitly or explicitly refers to 'this conversation', 'this email', 'the thread', or 'the customer' without further specification, " +
            "proactively call `front-get-current-conversation` to fetch the current conversation context before answering. " +
            "When asked to draft, reply, or write a response, use the available draft tools (`front-create-email-reply-draft`, `front-create-new-conversation-draft`, `front-update-draft`) to insert content directly into Front. " +
            "Do not ask the user to copy-paste conversation content — retrieve it directly with the available tools.",
        }
      );

      // Register all tools with the server.
      registerAllTools(server, this.frontContext);

      return server;
    } catch (error) {
      logger.error({ err: error }, "Error creating MCP server.");
      return null;
    }
  }

  /**
   * Connect the MCP server to a transport
   * This is required by the base class but our implementation is workspace-scoped
   */
  async connectServer(
    server: McpServer,
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<void> {
    if (!server) {
      throw new Error("Cannot connect null server");
    }

    try {
      // If we already have a transport for this workspace, reuse it.
      if (this.transport) {
        return;
      }

      // Create our custom transport with workspace-scoped registration.
      const transport = new BrowserMCPTransport(
        owner.sId,
        "front-extension-client",
        (serverId) => {
          this.serverId = serverId;
          onServerIdReceived(serverId);
        }
      );

      // Connect the server to the transport.
      await server.connect(transport);

      // Store the server and transport for future reuse.
      this.server = server;
      this.transport = transport;
    } catch (error) {
      logger.error({ err: error }, "Failed to connect MCP server.");
      throw error;
    }
  }

  /**
   * Get or create an MCP server for the workspace
   * This is a convenience method that provides the main API for client code
   */
  async getOrCreateServer(
    owner: WorkspaceType,
    onServerIdReceived: (serverId: string) => void
  ): Promise<{ server: McpServer | null; serverId: string | undefined }> {
    try {
      // Reuse existing server if we have one.
      if (this.server && this.transport) {
        return { server: this.server, serverId: this.serverId };
      }

      // Create a new server if we don't have one.
      const server = this.createServerForWorkspace();
      if (!server) {
        return { server: null, serverId: undefined };
      }

      // Connect the server.
      await this.connectServer(server, owner, onServerIdReceived);

      return { server: this.server, serverId: this.serverId };
    } catch (error) {
      logger.error({ err: error }, "Error getting or creating MCP server.");
      return { server: null, serverId: undefined };
    }
  }

  /**
   * Get the current server ID
   * This is useful for including in message payloads
   */
  getServerId(): string | undefined {
    return this.serverId;
  }

  /**
   * Disconnect and clean up the current server connection
   */
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
