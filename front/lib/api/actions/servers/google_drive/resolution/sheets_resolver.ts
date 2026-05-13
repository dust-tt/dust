import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { assertNever } from "@app/types/shared/utils/assert_never";
import type { sheets_v4 } from "googleapis";
import { z } from "zod";

const CellValueSchema = z
  .union([z.string(), z.number(), z.boolean()])
  .nullable();

const A1RangeSchema = z
  .string()
  .describe(
    "A1 range WITHOUT the sheet name prefix, e.g. 'A1:D10', 'A:A', '1:10', or 'A1'."
  );

const RgbColorSchema = z.object({
  red: z.number().min(0).max(1).optional(),
  green: z.number().min(0).max(1).optional(),
  blue: z.number().min(0).max(1).optional(),
});

const CellFormatSchema = z
  .object({
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    fontSize: z.number().positive().optional(),
    backgroundColor: RgbColorSchema.optional(),
    textColor: RgbColorSchema.optional(),
    horizontalAlignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
    numberFormat: z
      .object({
        type: z.enum([
          "TEXT",
          "NUMBER",
          "PERCENT",
          "CURRENCY",
          "DATE",
          "TIME",
          "SCIENTIFIC",
        ]),
        pattern: z.string().optional(),
      })
      .optional(),
  })
  .describe("Formatting to apply to all cells in the range.");

const SortSpecSchema = z.object({
  columnIndex: z
    .number()
    .int()
    .min(0)
    .describe("0-indexed column to sort by (relative to the range start)."),
  ascending: z.boolean().default(true),
});

export const SpreadsheetOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("updateCells"),
    sheetName: z
      .string()
      .describe(
        "Human-readable sheet/tab name (e.g. 'Sheet1', 'Budget Q4'). Server resolves to numeric sheetId."
      ),
    range: A1RangeSchema,
    values: z
      .array(z.array(CellValueSchema))
      .describe("2D array of cell values. Each sub-array is a row."),
  }),
  z.object({
    type: z.literal("formatCells"),
    sheetName: z.string(),
    range: A1RangeSchema,
    format: CellFormatSchema,
  }),
  z.object({
    type: z.literal("findReplace"),
    find: z.string(),
    replace: z.string(),
    sheetName: z
      .string()
      .optional()
      .describe("Scope to a specific sheet. If omitted, searches all sheets."),
    matchCase: z.boolean().default(false),
    matchEntireCell: z.boolean().default(false),
  }),
  z.object({
    type: z.literal("mergeCells"),
    sheetName: z.string(),
    range: A1RangeSchema,
    mergeType: z
      .enum(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"])
      .default("MERGE_ALL"),
  }),
  z.object({
    type: z.literal("insertRows"),
    sheetName: z.string(),
    startIndex: z
      .number()
      .int()
      .min(0)
      .describe("0-indexed row to insert before."),
    count: z.number().int().min(1).describe("Number of rows to insert."),
  }),
  z.object({
    type: z.literal("deleteRows"),
    sheetName: z.string(),
    startIndex: z.number().int().min(0),
    endIndex: z.number().int().min(1).describe("0-indexed exclusive end row."),
  }),
  z.object({
    type: z.literal("insertColumns"),
    sheetName: z.string(),
    startIndex: z.number().int().min(0),
    count: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("deleteColumns"),
    sheetName: z.string(),
    startIndex: z.number().int().min(0),
    endIndex: z.number().int().min(1),
  }),
  z.object({
    type: z.literal("sortRange"),
    sheetName: z.string(),
    range: A1RangeSchema,
    sortSpecs: z.array(SortSpecSchema).min(1),
  }),
  z.object({
    type: z.literal("addSheet"),
    title: z.string().describe("Title for the new sheet."),
  }),
  z.object({
    type: z.literal("deleteSheet"),
    title: z.string().describe("Title of the sheet to delete."),
  }),
  z.object({
    type: z.literal("autoResizeColumns"),
    sheetName: z.string(),
    range: A1RangeSchema.describe(
      "Range whose columns should be auto-resized. Only the column span matters."
    ),
  }),
  z.object({
    type: z.literal("raw"),
    request: z
      .record(z.string(), z.any())
      .describe(
        "Raw Google Sheets batchUpdate request object (e.g. {addChart: {...}}). Escape hatch when no lean operation covers your need."
      ),
  }),
]);

export type SpreadsheetOperation = z.infer<typeof SpreadsheetOperationSchema>;

export const SpreadsheetOperationsArraySchema = z.array(
  SpreadsheetOperationSchema
);

function columnLettersToIndex(letters: string): number {
  let result = 0;
  for (const c of letters.toUpperCase()) {
    result = result * 26 + (c.charCodeAt(0) - 64);
  }
  return result - 1;
}

type A1Parsed = {
  startRowIndex: number | null;
  endRowIndex: number | null;
  startColumnIndex: number | null;
  endColumnIndex: number | null;
};

/**
 * Parses an A1 range string WITHOUT a sheet prefix.
 * Accepts: "A1:D10", "A1", "A:D", "1:10".
 * Returns null indices for omitted axes (whole column / whole row).
 */
export function parseA1Range(range: string): Result<A1Parsed, Error> {
  if (range.includes("!")) {
    return new Err(
      new Error(
        `parseA1Range expects a range without the sheet prefix; got "${range}". Pass sheetName separately.`
      )
    );
  }
  const parts = range.split(":");
  if (parts.length < 1 || parts.length > 2) {
    return new Err(new Error(`Invalid A1 range: ${range}`));
  }

  const parseAnchor = (
    anchor: string
  ): Result<{ col: number | null; row: number | null }, Error> => {
    const m = anchor.match(/^([A-Za-z]+)?(\d+)?$/);
    if (!m || (!m[1] && !m[2])) {
      return new Err(new Error(`Invalid A1 anchor: ${anchor}`));
    }
    return new Ok({
      col: m[1] ? columnLettersToIndex(m[1]) : null,
      row: m[2] ? parseInt(m[2], 10) - 1 : null,
    });
  };

  const startResult = parseAnchor(parts[0]);
  if (startResult.isErr()) {
    return new Err(startResult.error);
  }
  const endResult =
    parts.length === 2 ? parseAnchor(parts[1]) : new Ok(startResult.value);
  if (endResult.isErr()) {
    return new Err(endResult.error);
  }

  const start = startResult.value;
  const end = endResult.value;

  return new Ok({
    startRowIndex: start.row,
    endRowIndex: end.row != null ? end.row + 1 : null,
    startColumnIndex: start.col,
    endColumnIndex: end.col != null ? end.col + 1 : null,
  });
}

function getSheetIdByTitle(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  title: string
): Result<number, Error> {
  const sheet = (spreadsheet.sheets ?? []).find(
    (s) => s.properties?.title === title
  );
  if (!sheet || sheet.properties?.sheetId == null) {
    return new Err(new Error(`Sheet not found: "${title}".`));
  }
  return new Ok(sheet.properties.sheetId);
}

function toGridRange(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  sheetName: string,
  range: string
): Result<sheets_v4.Schema$GridRange, Error> {
  const parsedResult = parseA1Range(range);
  if (parsedResult.isErr()) {
    return new Err(parsedResult.error);
  }
  const sheetIdResult = getSheetIdByTitle(spreadsheet, sheetName);
  if (sheetIdResult.isErr()) {
    return new Err(sheetIdResult.error);
  }
  const parsed = parsedResult.value;
  const gridRange: sheets_v4.Schema$GridRange = {
    sheetId: sheetIdResult.value,
  };
  if (parsed.startRowIndex != null) {
    gridRange.startRowIndex = parsed.startRowIndex;
  }
  if (parsed.endRowIndex != null) {
    gridRange.endRowIndex = parsed.endRowIndex;
  }
  if (parsed.startColumnIndex != null) {
    gridRange.startColumnIndex = parsed.startColumnIndex;
  }
  if (parsed.endColumnIndex != null) {
    gridRange.endColumnIndex = parsed.endColumnIndex;
  }
  return new Ok(gridRange);
}

function quoteSheetName(name: string): string {
  // Google's A1 syntax requires quoting when the sheet name contains anything
  // other than letters, digits, and underscores, or starts with a digit.
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    return name;
  }
  return `'${name.replace(/'/g, "''")}'`;
}

function buildFullA1(sheetName: string, range: string): string {
  return `${quoteSheetName(sheetName)}!${range}`;
}

export type ResolvedSpreadsheetOps = {
  valueUpdates: Array<{
    range: string;
    values: Array<Array<string | number | boolean | null>>;
  }>;
  batchRequests: sheets_v4.Schema$Request[];
};

export function resolveSpreadsheetOperations(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  operations: SpreadsheetOperation[]
): Result<ResolvedSpreadsheetOps, Error> {
  const valueUpdates: ResolvedSpreadsheetOps["valueUpdates"] = [];
  const batchRequests: sheets_v4.Schema$Request[] = [];

  for (const op of operations) {
    switch (op.type) {
      case "updateCells": {
        // Validate the sheet exists so the model gets a clear error instead
        // of a generic 400 from the values.batchUpdate API.
        const sheetCheck = getSheetIdByTitle(spreadsheet, op.sheetName);
        if (sheetCheck.isErr()) {
          return new Err(new Error(`updateCells: ${sheetCheck.error.message}`));
        }
        valueUpdates.push({
          range: buildFullA1(op.sheetName, op.range),
          values: op.values,
        });
        break;
      }
      case "formatCells": {
        const gridResult = toGridRange(spreadsheet, op.sheetName, op.range);
        if (gridResult.isErr()) {
          return new Err(new Error(`formatCells: ${gridResult.error.message}`));
        }
        const userEnteredFormat: sheets_v4.Schema$CellFormat = {};
        const fieldParts: string[] = [];
        const textFormat: sheets_v4.Schema$TextFormat = {};
        if (op.format.bold !== undefined) {
          textFormat.bold = op.format.bold;
        }
        if (op.format.italic !== undefined) {
          textFormat.italic = op.format.italic;
        }
        if (op.format.fontSize !== undefined) {
          textFormat.fontSize = op.format.fontSize;
        }
        if (op.format.textColor !== undefined) {
          textFormat.foregroundColor = op.format.textColor;
        }
        if (Object.keys(textFormat).length > 0) {
          userEnteredFormat.textFormat = textFormat;
          fieldParts.push("userEnteredFormat.textFormat");
        }
        if (op.format.backgroundColor !== undefined) {
          userEnteredFormat.backgroundColor = op.format.backgroundColor;
          fieldParts.push("userEnteredFormat.backgroundColor");
        }
        if (op.format.horizontalAlignment !== undefined) {
          userEnteredFormat.horizontalAlignment = op.format.horizontalAlignment;
          fieldParts.push("userEnteredFormat.horizontalAlignment");
        }
        if (op.format.numberFormat !== undefined) {
          userEnteredFormat.numberFormat = op.format.numberFormat;
          fieldParts.push("userEnteredFormat.numberFormat");
        }
        if (fieldParts.length === 0) {
          return new Err(
            new Error(
              "formatCells: at least one formatting property must be set."
            )
          );
        }
        batchRequests.push({
          repeatCell: {
            range: gridResult.value,
            cell: { userEnteredFormat },
            fields: fieldParts.join(","),
          },
        });
        break;
      }
      case "findReplace": {
        const req: sheets_v4.Schema$FindReplaceRequest = {
          find: op.find,
          replacement: op.replace,
          matchCase: op.matchCase,
          matchEntireCell: op.matchEntireCell,
        };
        if (op.sheetName) {
          const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetName);
          if (sheetIdResult.isErr()) {
            return new Err(
              new Error(`findReplace: ${sheetIdResult.error.message}`)
            );
          }
          req.sheetId = sheetIdResult.value;
        } else {
          req.allSheets = true;
        }
        batchRequests.push({ findReplace: req });
        break;
      }
      case "mergeCells": {
        const gridResult = toGridRange(spreadsheet, op.sheetName, op.range);
        if (gridResult.isErr()) {
          return new Err(new Error(`mergeCells: ${gridResult.error.message}`));
        }
        batchRequests.push({
          mergeCells: {
            range: gridResult.value,
            mergeType: op.mergeType,
          },
        });
        break;
      }
      case "insertRows": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetName);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`insertRows: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          insertDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: "ROWS",
              startIndex: op.startIndex,
              endIndex: op.startIndex + op.count,
            },
          },
        });
        break;
      }
      case "deleteRows": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetName);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`deleteRows: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          deleteDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: "ROWS",
              startIndex: op.startIndex,
              endIndex: op.endIndex,
            },
          },
        });
        break;
      }
      case "insertColumns": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetName);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`insertColumns: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          insertDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: "COLUMNS",
              startIndex: op.startIndex,
              endIndex: op.startIndex + op.count,
            },
          },
        });
        break;
      }
      case "deleteColumns": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetName);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`deleteColumns: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          deleteDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: "COLUMNS",
              startIndex: op.startIndex,
              endIndex: op.endIndex,
            },
          },
        });
        break;
      }
      case "sortRange": {
        const gridResult = toGridRange(spreadsheet, op.sheetName, op.range);
        if (gridResult.isErr()) {
          return new Err(new Error(`sortRange: ${gridResult.error.message}`));
        }
        const grid = gridResult.value;
        // dimensionIndex on sortRange is absolute on the sheet, not relative
        // to the range — offset each spec by the range's start column.
        const rangeStartColumn = grid.startColumnIndex ?? 0;
        const sortSpecs: sheets_v4.Schema$SortSpec[] = op.sortSpecs.map(
          (spec) => ({
            dimensionIndex: rangeStartColumn + spec.columnIndex,
            sortOrder: spec.ascending ? "ASCENDING" : "DESCENDING",
          })
        );
        batchRequests.push({
          sortRange: { range: grid, sortSpecs },
        });
        break;
      }
      case "addSheet": {
        batchRequests.push({
          addSheet: { properties: { title: op.title } },
        });
        break;
      }
      case "deleteSheet": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.title);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`deleteSheet: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          deleteSheet: { sheetId: sheetIdResult.value },
        });
        break;
      }
      case "autoResizeColumns": {
        const gridResult = toGridRange(spreadsheet, op.sheetName, op.range);
        if (gridResult.isErr()) {
          return new Err(
            new Error(`autoResizeColumns: ${gridResult.error.message}`)
          );
        }
        const grid = gridResult.value;
        batchRequests.push({
          autoResizeDimensions: {
            dimensions: {
              sheetId: grid.sheetId,
              dimension: "COLUMNS",
              startIndex: grid.startColumnIndex ?? 0,
              ...(grid.endColumnIndex != null
                ? { endIndex: grid.endColumnIndex }
                : {}),
            },
          },
        });
        break;
      }
      case "raw": {
        // Escape hatch: caller takes responsibility for the request shape; the
        // googleapis Schema$Request type is too wide to typeguard usefully.
        batchRequests.push(op.request as sheets_v4.Schema$Request);
        break;
      }
      default:
        assertNever(op);
    }
  }

  return new Ok({ valueUpdates, batchRequests });
}
