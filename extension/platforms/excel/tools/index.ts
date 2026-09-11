import { registerAddWorksheetTool } from "@extension/platforms/excel/tools/addWorksheetTool";
import { registerGetSelectionTool } from "@extension/platforms/excel/tools/getSelectionTool";
import { registerListWorksheetsTool } from "@extension/platforms/excel/tools/listWorksheetsTool";
import { registerReadRangeTool } from "@extension/platforms/excel/tools/readRangeTool";
import { registerWriteRangeTool } from "@extension/platforms/excel/tools/writeRangeTool";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers all tools with the MCP server.
 *
 * Unlike the Front plugin, none of these need a context object passed in: the
 * Excel JavaScript API reads the live workbook state on every `Excel.run`.
 *
 * @param server The MCP server to register tools with
 */
export function registerAllTools(server: McpServer): void {
  // Register workbook inspection tools.
  registerListWorksheetsTool(server);

  // Register read tools.
  registerGetSelectionTool(server);
  registerReadRangeTool(server);

  // Register write tools.
  registerWriteRangeTool(server);
  registerAddWorksheetTool(server);
}
