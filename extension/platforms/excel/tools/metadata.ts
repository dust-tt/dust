import type { ToolMeta } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { z } from "zod";

export const READ_WORKBOOK_TOOL_NAME = "read_workbook";

const MAX_EXPRESSION_LENGTH = 1_000;

const READ_WORKBOOK_TOOL_DESCRIPTION = `Reads data from the Excel workbook that the user has open.

Each read is an Office.js Excel expression that starts with \`workbook\`. End the expression with \`load(...)\` to give the properties to return. Do not add \`load(...)\` after a method that gives a value, for example \`getCount()\`. The result has one item for each read, in the same order.

Example:
{ "reads": [
  { "expression": "workbook.worksheets.load('name')" },
  { "expression": "workbook.worksheets.getItem('Sheet1').getRange('A1:C10').load(['address', 'values', 'format/fill/color'])" },
  { "expression": "workbook.tables.getCount()" }
] }`;

const readSchema = z.object({
  expression: z
    .string()
    .max(MAX_EXPRESSION_LENGTH)
    .describe(
      "An Office.js Excel expression that starts with `workbook`. Use only properties and method calls with literal arguments. Do not use `context`, `await` or `sync()`."
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
        .describe(
          "The reads to run. They are sent to Excel together, in one sync."
        ),
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
