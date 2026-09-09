import { normalizeError } from "@extension/shared/lib/utils";

/** A cell value as Office.js hands it to us / accepts it back. */
export type CellValue = string | number | boolean | null;

/**
 * The shape every tool in this folder returns.
 *
 * Declared as a type alias rather than an interface on purpose: the MCP SDK's
 * `CallToolResult` carries an index signature, and only type aliases get the
 * implicit one that makes them assignable to it.
 */
export type ToolResult = {
  isError: boolean;
  content: { type: "text"; text: string }[];
};

export function toolError(text: string): ToolResult {
  return { isError: true, content: [{ type: "text", text }] };
}

export function toolSuccess(text: string): ToolResult {
  return { isError: false, content: [{ type: "text", text }] };
}

/**
 * Runs `fn` inside an `Excel.run` batch and normalizes any failure into a tool
 * error, so a thrown `OfficeExtension.Error` surfaces to the model as readable
 * text instead of crashing the tool call.
 */
/**
 * @cc [owner:Nils-Fedrigo,label:error-handling] runexcel-never-throws
 * `runExcel` never rejects: an unavailable `Excel` API, and any error thrown by
 * `fn` or by the `Excel.run` batch, resolve to a `ToolResult` whose `isError` is
 * `true` and whose `content` describes the failure.
 */
export async function runExcel(
  action: string,
  fn: (context: Excel.RequestContext) => Promise<ToolResult>
): Promise<ToolResult> {
  if (typeof Excel === "undefined") {
    return toolError(
      "The Excel JavaScript API is not available. The Dust task pane must be " +
        "running inside Excel for this tool to work."
    );
  }

  try {
    return await Excel.run(fn);
  } catch (error) {
    console.error(`Error while trying to ${action} in Excel:`, error);

    return toolError(
      `Error while trying to ${action}: ${normalizeError(error)}`
    );
  }
}

/**
 * Resolves a worksheet by name, or the active worksheet when no name is given.
 */
export function getWorksheet(
  context: Excel.RequestContext,
  sheetName?: string
): Excel.Worksheet {
  return sheetName
    ? context.workbook.worksheets.getItem(sheetName)
    : context.workbook.worksheets.getActiveWorksheet();
}

/**
 * Renders a rectangular block of cells as TSV, which is both compact and
 * unambiguous for an LLM to read back. Empty cells become empty fields, and
 * tabs/newlines inside a cell are escaped so each row stays on one line.
 */
export function formatGridAsTsv(values: CellValue[][]): string {
  return values
    .map((row) =>
      row
        .map((cell) => {
          if (cell === null || cell === undefined || cell === "") {
            return "";
          }
          return String(cell).replace(/\t/g, "    ").replace(/\r?\n/g, " ");
        })
        .join("\t")
    )
    .join("\n");
}

/** Number of cells we are willing to serialize into a single tool result. */
export const MAX_CELLS_PER_READ = 20_000;
