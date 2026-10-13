import type { ToolMeta } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const READ_WORKBOOK_TOOL_NAME = "read_workbook";

const READ_WORKBOOK_TOOL_DESCRIPTION = `Reads data from the Excel workbook the user has open, with the Office.js Excel API.

Each read gives an Office.js expression that starts with \`workbook\` (the \`context.workbook\` object, written without \`context.\`), and the properties to load on the object it gives. The reads are sent to Excel in one batch; the result is a JSON array with one loaded object per read, in the same order. Only read operations are allowed.

Example — list the worksheets, read the selection and read a range in one call:
{ "reads": [
  { "expression": "workbook.worksheets", "load": ["name"] },
  { "expression": "workbook.getSelectedRange()", "load": ["address", "values"] },
  { "expression": "workbook.worksheets.getItem('Sheet1').getRange('A1:C10')", "load": ["values", "formulas", "numberFormat"] },
  { "expression": "workbook.tables.getCount()" }
] }

Methods such as \`getCount()\` or \`getCellProperties(...)\` give a value directly: omit \`load\` for those.

On a large sheet, load the address of the used range first, then read the values in blocks.`;

const readSchema = z.object({
  expression: z
    .string()
    .describe("An Office.js expression that starts at `workbook`."),
  load: z
    .array(z.string())
    .nullish()
    .describe(
      "The properties to load on the object the expression gives. Omit it for methods that give a value directly, such as getCount() or getCellProperties(...)."
    ),
});

const MAX_READS = 50;

export const EXCEL_TOOLS_METADATA = [
  {
    name: READ_WORKBOOK_TOOL_NAME,
    description: READ_WORKBOOK_TOOL_DESCRIPTION,
    schema: {
      reads: z
        .array(readSchema)
        .min(1)
        .max(MAX_READS)
        .describe("The reads to run, in one batch."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Reading the workbook...",
      done: "Workbook read",
    },
    toolCostCategory: "basic",
    freeUsage: true,
  },
] as const satisfies readonly ToolMeta[];
