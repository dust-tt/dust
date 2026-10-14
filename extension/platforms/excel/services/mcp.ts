import { registerAllTools } from "@extension/platforms/excel/tools";
import { McpService } from "@extension/shared/services/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const EXCEL_MCP_CLIENT_NAME = "excel-add-in-client";
const EXCEL_MCP_SERVER_NAME = "excel-mcp-server";
const EXCEL_MCP_SERVER_INSTRUCTIONS =
  "You are running inside a Dust add-in embedded in Microsoft Excel.";

/**
 * Excel-specific implementation of the MCP service.
 */
export class ExcelMcpService extends McpService {
  constructor() {
    super(EXCEL_MCP_CLIENT_NAME);
  }

  protected createServer(): McpServer {
    const server = new McpServer(
      {
        name: EXCEL_MCP_SERVER_NAME,
        version: "1.0.0",
      },
      {
        instructions: EXCEL_MCP_SERVER_INSTRUCTIONS,
      }
    );

    registerAllTools(server);

    return server;
  }
}
