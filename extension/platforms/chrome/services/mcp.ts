import { registerAllTools } from "@extension/shared/browser_tools";
import { getBrowserMCPServerInstructions } from "@extension/shared/browser_tools/metadata";
import type { CaptureService } from "@extension/shared/services/capture";
import { McpService } from "@extension/shared/services/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const CHROME_MCP_SERVER_NAME = "chrome-mcp-server";
const CHROME_MCP_CLIENT_NAME = "dust-chrome-extension";

/**
 * Chrome-specific implementation of the MCP service.
 * Tools use the capture service to retrieve page content.
 */
export class ChromeMcpService extends McpService {
  private captureService: CaptureService | null = null;

  constructor() {
    super(CHROME_MCP_CLIENT_NAME);
  }

  setCaptureService(captureService: CaptureService): void {
    this.captureService = captureService;
  }

  protected createServer(): McpServer {
    const server = new McpServer(
      {
        name: CHROME_MCP_SERVER_NAME,
        version: "1.0.0",
      },
      {
        instructions: getBrowserMCPServerInstructions({
          platformName: "Chrome",
          serverName: CHROME_MCP_SERVER_NAME,
        }),
      }
    );

    registerAllTools(server, this.captureService);

    return server;
  }
}
