import {
  formatGridAsTsv,
  MAX_CELLS_PER_READ,
  runExcel,
  toolError,
  toolSuccess,
} from "@extension/platforms/excel/tools/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the "read the current selection" tool with the MCP server.
 */
export function registerGetSelectionTool(server: McpServer): void {
  server.tool(
    "excel-get-selection",
    "Reads the cells the user currently has selected in the open Excel workbook. Returns the\n" +
      "sheet name, the selected range address and the cell values as tab-separated rows.\n" +
      "Use this whenever the user refers to 'this', 'the selection', 'these cells' or 'the\n" +
      "selected data' without naming an explicit range.",
    async () =>
      runExcel("read the current selection", async (context) => {
        const worksheet = context.workbook.worksheets.getActiveWorksheet();
        const selection = context.workbook.getSelectedRange();

        worksheet.load("name");
        selection.load(["address", "cellCount", "values"]);

        await context.sync();

        if (selection.cellCount > MAX_CELLS_PER_READ) {
          return toolError(
            `The selection covers ${selection.cellCount} cells, which is more than the ` +
              `${MAX_CELLS_PER_READ} this tool can return. Ask the user to select a smaller ` +
              `range, or read it in chunks with \`excel-read-range\`.`
          );
        }

        return toolSuccess(
          `SHEET: ${worksheet.name}\n` +
            `RANGE: ${selection.address}\n` +
            `CELLS: ${selection.cellCount}\n` +
            `VALUES (tab-separated):\n${formatGridAsTsv(selection.values)}`
        );
      })
  );
}
