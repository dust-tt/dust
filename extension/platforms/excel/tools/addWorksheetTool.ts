import {
  runExcel,
  toolError,
  toolSuccess,
} from "@extension/platforms/excel/tools/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const ExcelAddWorksheetToolArgsSchema = z.object({
  name: z
    .string()
    .describe(
      "The name for the new worksheet. Must not collide with an existing sheet name."
    ),
  activate: z
    .boolean()
    .describe(
      "Whether to switch the user to the new sheet once created. Defaults to true."
    )
    .optional(),
});

/**
 * Registers the "add a worksheet" tool with the MCP server.
 */
export function registerAddWorksheetTool(server: McpServer): void {
  server.tool(
    "excel-add-worksheet",
    "Adds a new, empty worksheet to the open Excel workbook. Use this before writing a\n" +
      "generated table or report so that existing sheets are left untouched, then fill it\n" +
      "in with `excel-write-range`.",
    { worksheet: ExcelAddWorksheetToolArgsSchema },
    async ({ worksheet: options }) =>
      runExcel("add a worksheet", async (context) => {
        const worksheets = context.workbook.worksheets;
        worksheets.load("items/name");

        await context.sync();

        if (worksheets.items.some((sheet) => sheet.name === options.name)) {
          return toolError(
            `A worksheet named "${options.name}" already exists. Pick a different name, or ` +
              `write into the existing sheet with \`excel-write-range\`.`
          );
        }

        const created = worksheets.add(options.name);
        if (options.activate ?? true) {
          created.activate();
        }
        created.load("name");

        await context.sync();

        return toolSuccess(`Created worksheet "${created.name}".`);
      })
  );
}
