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
    "A1 notation range, e.g. 'Sheet1!A1:D10', 'A1:D10', or 'Sheet1!A:A'. The sheet name is optional; if omitted, the first sheet is used."
  );

const HexColorSchema = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .describe("Hex color, e.g. '#FF0000'.");

export const SpreadsheetOperationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("updateCells"),
    range: A1RangeSchema,
    values: z
      .array(z.array(CellValueSchema))
      .describe("Row-major values. Use null to clear a cell."),
  }),
  z.object({
    type: z.literal("formatRange"),
    range: A1RangeSchema,
    bold: z.boolean().optional(),
    italic: z.boolean().optional(),
    backgroundColorHex: HexColorSchema.optional(),
    textColorHex: HexColorSchema.optional(),
    horizontalAlignment: z.enum(["LEFT", "CENTER", "RIGHT"]).optional(),
    numberFormat: z
      .string()
      .optional()
      .describe(
        "Number format pattern, e.g. '0.00', '#,##0', '0.00%', 'yyyy-mm-dd'."
      ),
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
    type: z.literal("mergeCells"),
    range: A1RangeSchema,
    mergeType: z
      .enum(["MERGE_ALL", "MERGE_COLUMNS", "MERGE_ROWS"])
      .default("MERGE_ALL"),
  }),
  z.object({
    type: z.literal("autoResizeColumns"),
    range: A1RangeSchema.describe(
      "Range whose columns should be auto-resized. Only the column span matters."
    ),
  }),
  z.object({
    type: z.literal("insertDimension"),
    sheetTitle: z.string(),
    dimension: z.enum(["ROWS", "COLUMNS"]),
    startIndex: z.number().int().nonnegative(),
    endIndex: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("deleteDimension"),
    sheetTitle: z.string(),
    dimension: z.enum(["ROWS", "COLUMNS"]),
    startIndex: z.number().int().nonnegative(),
    endIndex: z.number().int().positive(),
  }),
  z.object({
    type: z.literal("sortRange"),
    range: A1RangeSchema,
    columnIndex: z
      .number()
      .int()
      .nonnegative()
      .describe("Zero-based column index within the range to sort by."),
    order: z.enum(["ASCENDING", "DESCENDING"]).default("ASCENDING"),
  }),
  z.object({
    type: z.literal("findReplace"),
    find: z.string(),
    replace: z.string(),
    sheetTitle: z
      .string()
      .optional()
      .describe("Restrict to a sheet; if omitted, applies to all sheets."),
    matchCase: z.boolean().optional(),
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
  sheetName: string | null;
  startRowIndex: number | null;
  endRowIndex: number | null;
  startColumnIndex: number | null;
  endColumnIndex: number | null;
};

function parseA1(range: string): Result<A1Parsed, Error> {
  let cellPart = range;
  let sheetName: string | null = null;

  // We split on the last `!` — this is correct for typical A1 input. A quoted
  // sheet name that contains an unescaped `!` would mis-split, but Google's
  // own A1 parser requires `!` inside a sheet name to be quoted with `''`
  // anyway, so this matches Google's own behavior.
  const bangIdx = range.lastIndexOf("!");
  if (bangIdx > -1) {
    let prefix = range.slice(0, bangIdx);
    cellPart = range.slice(bangIdx + 1);
    if (prefix.startsWith("'") && prefix.endsWith("'")) {
      prefix = prefix.slice(1, -1).replace(/''/g, "'");
    }
    sheetName = prefix;
  }

  // If only a sheet name is given (no cell part), treat as the entire sheet.
  if (cellPart.length === 0) {
    return new Ok({
      sheetName,
      startRowIndex: null,
      endRowIndex: null,
      startColumnIndex: null,
      endColumnIndex: null,
    });
  }

  const parts = cellPart.split(":");
  if (parts.length < 1 || parts.length > 2) {
    return new Err(new Error(`Invalid A1 range: ${cellPart}`));
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
    sheetName,
    startRowIndex: start.row,
    endRowIndex: end.row != null ? end.row + 1 : null,
    startColumnIndex: start.col,
    endColumnIndex: end.col != null ? end.col + 1 : null,
  });
}

function getSheetIdByTitle(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  title: string | null
): Result<number, Error> {
  const sheets = spreadsheet.sheets ?? [];
  const match =
    title == null
      ? sheets[0]
      : sheets.find((s) => s.properties?.title === title);
  if (!match || match.properties?.sheetId == null) {
    return new Err(new Error(`Sheet not found: ${title ?? "(first sheet)"}`));
  }
  return new Ok(match.properties.sheetId);
}

function toGridRange(
  spreadsheet: sheets_v4.Schema$Spreadsheet,
  range: string
): Result<sheets_v4.Schema$GridRange, Error> {
  const parsedResult = parseA1(range);
  if (parsedResult.isErr()) {
    return new Err(parsedResult.error);
  }
  const parsed = parsedResult.value;
  const sheetIdResult = getSheetIdByTitle(spreadsheet, parsed.sheetName);
  if (sheetIdResult.isErr()) {
    return new Err(sheetIdResult.error);
  }
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

function hexToRgb(hex: string): { red: number; green: number; blue: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return { red: r, green: g, blue: b };
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
        valueUpdates.push({ range: op.range, values: op.values });
        break;
      }
      case "formatRange": {
        const gridResult = toGridRange(spreadsheet, op.range);
        if (gridResult.isErr()) {
          return new Err(new Error(`formatRange: ${gridResult.error.message}`));
        }
        const textFormat: sheets_v4.Schema$TextFormat = {};
        if (op.bold !== undefined) {
          textFormat.bold = op.bold;
        }
        if (op.italic !== undefined) {
          textFormat.italic = op.italic;
        }
        if (op.textColorHex !== undefined) {
          textFormat.foregroundColor = hexToRgb(op.textColorHex);
        }
        const userEnteredFormat: sheets_v4.Schema$CellFormat = {};
        const fieldParts: string[] = [];
        if (Object.keys(textFormat).length > 0) {
          userEnteredFormat.textFormat = textFormat;
          fieldParts.push("userEnteredFormat.textFormat");
        }
        if (op.backgroundColorHex !== undefined) {
          userEnteredFormat.backgroundColor = hexToRgb(op.backgroundColorHex);
          fieldParts.push("userEnteredFormat.backgroundColor");
        }
        if (op.horizontalAlignment !== undefined) {
          userEnteredFormat.horizontalAlignment = op.horizontalAlignment;
          fieldParts.push("userEnteredFormat.horizontalAlignment");
        }
        if (op.numberFormat !== undefined) {
          userEnteredFormat.numberFormat = {
            type: "NUMBER",
            pattern: op.numberFormat,
          };
          fieldParts.push("userEnteredFormat.numberFormat");
        }
        if (fieldParts.length === 0) {
          return new Err(
            new Error(
              "formatRange: at least one formatting property must be set."
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
      case "mergeCells": {
        const gridResult = toGridRange(spreadsheet, op.range);
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
      case "autoResizeColumns": {
        const gridResult = toGridRange(spreadsheet, op.range);
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
      case "insertDimension": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetTitle);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`insertDimension: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          insertDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: op.dimension,
              startIndex: op.startIndex,
              endIndex: op.endIndex,
            },
          },
        });
        break;
      }
      case "deleteDimension": {
        const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetTitle);
        if (sheetIdResult.isErr()) {
          return new Err(
            new Error(`deleteDimension: ${sheetIdResult.error.message}`)
          );
        }
        batchRequests.push({
          deleteDimension: {
            range: {
              sheetId: sheetIdResult.value,
              dimension: op.dimension,
              startIndex: op.startIndex,
              endIndex: op.endIndex,
            },
          },
        });
        break;
      }
      case "sortRange": {
        const gridResult = toGridRange(spreadsheet, op.range);
        if (gridResult.isErr()) {
          return new Err(new Error(`sortRange: ${gridResult.error.message}`));
        }
        const grid = gridResult.value;
        // The Sheets API sortRange.sortSpecs.dimensionIndex is absolute on the
        // sheet (not relative to the range), so offset by the range's start
        // column.
        const absoluteColumnIndex =
          (grid.startColumnIndex ?? 0) + op.columnIndex;
        batchRequests.push({
          sortRange: {
            range: grid,
            sortSpecs: [
              {
                dimensionIndex: absoluteColumnIndex,
                sortOrder: op.order,
              },
            ],
          },
        });
        break;
      }
      case "findReplace": {
        const req: sheets_v4.Schema$FindReplaceRequest = {
          find: op.find,
          replacement: op.replace,
          ...(op.matchCase !== undefined ? { matchCase: op.matchCase } : {}),
        };
        if (op.sheetTitle) {
          const sheetIdResult = getSheetIdByTitle(spreadsheet, op.sheetTitle);
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
