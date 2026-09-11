import {
  formatGridAsTsv,
  getWorksheet,
  MAX_CELLS_PER_READ,
  runExcel,
  toolError,
  toolSuccess,
} from "@extension/platforms/excel/tools/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const ExcelReadRangeToolArgsSchema = z.object({
  sheetName: z
    .string()
    .describe(
      "The name of the worksheet to read from. Defaults to the active worksheet."
    )
    .optional(),
  address: z
    .string()
    .describe(
      "The A1-style range to read, e.g. `A1:D20` or `B:B`. When omitted, the sheet's " +
        "used range (every cell that contains data) is read."
    )
    .optional(),
});

/**
 * Registers the "read an explicit range" tool with the MCP server.
 */
export function registerReadRangeTool(server: McpServer): void {
  server.tool(
    "excel-read-range",
    "Reads cell values from the open Excel workbook. Specify a sheet and an A1-style range,\n" +
      "or omit the range to read everything on the sheet that contains data. Returns the\n" +
      "resolved range address and the values as tab-separated rows.",
    { range: ExcelReadRangeToolArgsSchema },
    async ({ range }) =>
      runExcel("read a range", async (context) => {
        const worksheet = getWorksheet(context, range.sheetName);
        const target = range.address
          ? worksheet.getRange(range.address)
          : worksheet.getUsedRange();

        worksheet.load("name");
        target.load(["address", "cellCount", "values"]);

        await context.sync();

        if (target.cellCount > MAX_CELLS_PER_READ) {
          return toolError(
            `${target.address} covers ${target.cellCount} cells, which is more than the ` +
              `${MAX_CELLS_PER_READ} this tool can return. Read it in smaller chunks.`
          );
        }

        return toolSuccess(
          `SHEET: ${worksheet.name}\n` +
            `RANGE: ${target.address}\n` +
            `CELLS: ${target.cellCount}\n` +
            `VALUES (tab-separated):\n${formatGridAsTsv(target.values)}`
        );
      })
  );
}
