import { registerAllTools } from "@extension/platforms/front/tools";
import { McpService } from "@extension/shared/services/mcp";
import type { WebViewContext } from "@frontapp/plugin-sdk/dist/webViewSdkTypes";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const FRONT_MCP_CLIENT_NAME = "front-extension-client";

/**
 * Front-specific implementation of the MCP service
 */
export class FrontMcpService extends McpService {
  private frontContext: WebViewContext | null = null;

  constructor() {
    super(FRONT_MCP_CLIENT_NAME);
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
  protected createServer(): McpServer {
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
  }
}
