import { runExcel, toolSuccess } from "@extension/platforms/excel/tools/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Registers the "describe the workbook" tool with the MCP server.
 */
export function registerListWorksheetsTool(server: McpServer): void {
  server.tool(
    "excel-list-worksheets",
    "Lists the worksheets in the open Excel workbook, with each sheet's visibility, whether\n" +
      "it is the active one, and the address of the cells it actually uses. Call this first\n" +
      "when you need to know how the workbook is laid out before reading or writing data.",
    async () =>
      runExcel("list the worksheets", async (context) => {
        const worksheets = context.workbook.worksheets;
        const activeWorksheet = worksheets.getActiveWorksheet();

        context.workbook.load("name");
        worksheets.load("items/name,items/position,items/visibility");
        activeWorksheet.load("name");

        await context.sync();

        // `getUsedRange(true)` returns a null-object rather than throwing when a
        // sheet is empty, so the batch below is safe for blank sheets.
        const usedRanges = worksheets.items.map((sheet) => {
          const usedRange = sheet.getUsedRange(true);
          usedRange.load(["address", "isNullObject"]);
          return usedRange;
        });

        await context.sync();

        const sheetLines = worksheets.items.map((sheet, index) => {
          const usedRange = usedRanges[index];
          const used = usedRange.isNullObject ? "(empty)" : usedRange.address;
          const isActive =
            sheet.name === activeWorksheet.name ? " [ACTIVE]" : "";

          return (
            `- ${sheet.name}${isActive} | position: ${sheet.position} | ` +
            `visibility: ${sheet.visibility} | used range: ${used}`
          );
        });

        return toolSuccess(
          `WORKBOOK: ${context.workbook.name}\n` +
            `WORKSHEETS (${worksheets.items.length}):\n${sheetLines.join("\n")}`
        );
      })
  );
}
