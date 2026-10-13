import { registerAllTools } from "@extension/shared/browser_tools";
import { getBrowserMCPServerInstructions } from "@extension/shared/browser_tools/metadata";
import type { CaptureService } from "@extension/shared/services/capture";
import { McpService } from "@extension/shared/services/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const FIREFOX_MCP_SERVER_NAME = "firefox-mcp-server";
const FIREFOX_MCP_CLIENT_NAME = "dust-firefox-extension";

/**
 * Firefox-specific implementation of the MCP service.
 * Tools use the capture service to retrieve page content.
 */
export class FirefoxMcpService extends McpService {
  private captureService: CaptureService | null = null;

  constructor() {
    super(FIREFOX_MCP_CLIENT_NAME);
  }

  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
  }

  protected createServer(): McpServer {
    const server = new McpServer(
      {
        name: FIREFOX_MCP_SERVER_NAME,
        version: "1.0.0",
      },
      {
        instructions: getBrowserMCPServerInstructions({
          platformName: "Firefox",
          serverName: FIREFOX_MCP_SERVER_NAME,
        }),
      }
    );

    registerAllTools(server, this.captureService);

    return server;
  }
}
