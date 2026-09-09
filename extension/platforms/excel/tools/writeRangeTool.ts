import type { CellValue } from "@extension/platforms/excel/tools/utils";
import {
  getWorksheet,
  runExcel,
  toolError,
  toolSuccess,
} from "@extension/platforms/excel/tools/utils";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

export const ExcelWriteRangeToolArgsSchema = z.object({
  sheetName: z
    .string()
    .describe(
      "The name of the worksheet to write to. Defaults to the active worksheet."
    )
    .optional(),
  address: z
    .string()
    .describe(
      "Where to write. Either the full A1-style target range (e.g. `A1:C10`, which must " +
        "match the shape of `values`) or just its top-left cell (e.g. `A1`), in which case " +
        "the range is sized from `values`."
    ),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .describe(
      "The cell values as an array of rows, each row an array of cells. Every row must " +
        "have the same length. Use `null` to leave a cell empty."
    ),
  asFormulas: z
    .boolean()
    .describe(
      "Set to true when `values` contains Excel formulas (e.g. `=SUM(A1:A9)`) that should " +
        "be evaluated rather than stored as literal text. Defaults to false."
    )
    .optional(),
});

/** Rejects ragged or empty grids, which Office.js would reject with an opaque error. */
function validateGrid(
  values: CellValue[][]
): { rowCount: number; columnCount: number } | null {
  const rowCount = values.length;
  if (rowCount === 0) {
    return null;
  }

  const columnCount = values[0].length;
  if (columnCount === 0 || values.some((row) => row.length !== columnCount)) {
    return null;
  }

  return { rowCount, columnCount };
}

/**
 * Registers the "write cells" tool with the MCP server.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:product] write-range-confined-to-target
 * `excel-write-range` modifies only the cells of the range resolved from
 * `address` — that range itself when it matches the shape of `values`, or the
 * block of that shape anchored at a single-cell `address`. It writes nothing and
 * returns an error result when `values` is empty or ragged, or when a multi-cell
 * `address` does not match the shape of `values`.
 */
export function registerWriteRangeTool(server: McpServer): void {
  server.tool(
    "excel-write-range",
    "Writes values or formulas into the open Excel workbook. Use this to fill in results,\n" +
      "add computed columns, or lay out a table the user asked for. The write is applied\n" +
      "directly to the workbook and the user can undo it with Ctrl+Z / Cmd+Z.",
    { write: ExcelWriteRangeToolArgsSchema },
    async ({ write }) =>
      runExcel("write to a range", async (context) => {
        const grid = validateGrid(write.values);
        if (!grid) {
          return toolError(
            "`values` must be a non-empty array of equal-length rows."
          );
        }

        const worksheet = getWorksheet(context, write.sheetName);
        const anchor = worksheet.getRange(write.address);

        anchor.load(["columnCount", "rowCount"]);

        await context.sync();

        // A single-cell address is treated as the top-left corner and grown to
        // fit the payload; anything else has to match it exactly.
        const isAnchorOnly = anchor.rowCount === 1 && anchor.columnCount === 1;
        const isFullRange =
          anchor.rowCount === grid.rowCount &&
          anchor.columnCount === grid.columnCount;

        if (!isAnchorOnly && !isFullRange) {
          return toolError(
            `${write.address} is ${anchor.rowCount}x${anchor.columnCount} but \`values\` is ` +
              `${grid.rowCount}x${grid.columnCount}. Pass a matching range, or pass only the ` +
              `top-left cell and let the range be sized automatically.`
          );
        }

        const target = isFullRange
          ? anchor
          : anchor.getResizedRange(grid.rowCount - 1, grid.columnCount - 1);

        if (write.asFormulas) {
          target.formulas = write.values;
        } else {
          target.values = write.values;
        }
        target.load("address");

        await context.sync();

        // `Range.address` is already sheet-qualified (e.g. `Sheet1!A1:C3`).
        return toolSuccess(
          `Wrote ${grid.rowCount}x${grid.columnCount} cells to ${target.address}.`
        );
      })
  );
}
