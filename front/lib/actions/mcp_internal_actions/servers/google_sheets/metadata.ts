// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

import type { JSONSchema7 } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

import type { MCPToolStakeLevelType } from "@app/lib/actions/constants";
import type { MCPToolType } from "@app/lib/api/mcp";
import type { MCPOAuthUseCase } from "@app/types";

// =============================================================================
// Exports for monitoring
// =============================================================================

export const GOOGLE_SHEETS_TOOL_NAME = "google_sheets" as const;

// =============================================================================
// Tool Schemas - Input schemas for each tool
// =============================================================================

export const listSpreadsheetsSchema = {
  nameFilter: z
    .string()
    .optional()
    .describe(
      "The text to search for in file names. Uses Google Drive's 'contains' operator which is case-insensitive and performs prefix matching only. For example, searching 'hello' will match 'HelloWorld' but not 'WorldHello'."
    ),
  pageToken: z.string().optional().describe("Page token for pagination."),
  pageSize: z
    .number()
    .optional()
    .describe("Maximum number of spreadsheets to return (max 1000)."),
};

export const getSpreadsheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet to retrieve."),
  includeGridData: z
    .boolean()
    .default(false)
    .describe("Whether to include grid data in the response."),
};

export const getWorksheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  range: z
    .string()
    .describe(
      "The A1 notation of the range to retrieve (e.g., 'Sheet1!A1:D10' or 'A1:D10')."
    ),
  majorDimension: z
    .enum(["ROWS", "COLUMNS"])
    .default("ROWS")
    .describe("The major dimension of the values."),
  valueRenderOption: z
    .enum(["FORMATTED_VALUE", "UNFORMATTED_VALUE", "FORMULA"])
    .default("FORMATTED_VALUE")
    .describe("How values should be represented in the output."),
};

export const updateCellsSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  range: z
    .string()
    .describe(
      "The A1 notation of the range to update (e.g., 'Sheet1!A1:D10')."
    ),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .describe("The values to update. Each sub-array represents a row."),
  majorDimension: z
    .enum(["ROWS", "COLUMNS"])
    .default("ROWS")
    .describe("The major dimension of the values."),
  valueInputOption: z
    .enum(["RAW", "USER_ENTERED"])
    .default("USER_ENTERED")
    .describe("How the input data should be interpreted."),
};

export const appendDataSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  range: z
    .string()
    .describe(
      "The A1 notation of the range to append to (e.g., 'Sheet1!A1:D1')."
    ),
  values: z
    .array(z.array(z.union([z.string(), z.number(), z.boolean()])))
    .describe("The values to append. Each sub-array represents a row."),
  majorDimension: z
    .enum(["ROWS", "COLUMNS"])
    .default("ROWS")
    .describe("The major dimension of the values."),
  valueInputOption: z
    .enum(["RAW", "USER_ENTERED"])
    .default("USER_ENTERED")
    .describe("How the input data should be interpreted."),
  insertDataOption: z
    .enum(["OVERWRITE", "INSERT_ROWS"])
    .default("INSERT_ROWS")
    .describe("How the input data should be inserted."),
};

export const clearRangeSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  range: z
    .string()
    .describe("The A1 notation of the range to clear (e.g., 'Sheet1!A1:D10')."),
};

export const createSpreadsheetSchema = {
  title: z.string().describe("The title of the new spreadsheet."),
  sheetTitles: z
    .array(z.string())
    .optional()
    .describe(
      "Titles for initial sheets. If not provided, creates one sheet with default title."
    ),
};

export const addWorksheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  title: z.string().describe("The title of the new worksheet."),
  rowCount: z
    .number()
    .optional()
    .describe("Number of rows in the new worksheet."),
  columnCount: z
    .number()
    .optional()
    .describe("Number of columns in the new worksheet."),
};

export const deleteWorksheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  sheetId: z.number().describe("The ID of the worksheet to delete."),
};

export const formatCellsSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  sheetId: z.number().describe("The ID of the worksheet to format."),
  startRowIndex: z.number().describe("The start row index (0-based)."),
  endRowIndex: z.number().describe("The end row index (exclusive)."),
  startColumnIndex: z.number().describe("The start column index (0-based)."),
  endColumnIndex: z.number().describe("The end column index (exclusive)."),
  format: z
    .object({
      backgroundColor: z
        .object({
          red: z.number().min(0).max(1).optional(),
          green: z.number().min(0).max(1).optional(),
          blue: z.number().min(0).max(1).optional(),
        })
        .optional()
        .describe("Background color in RGB format (values 0-1)."),
      textFormat: z
        .object({
          bold: z.boolean().optional(),
          italic: z.boolean().optional(),
          fontSize: z.number().optional(),
        })
        .optional()
        .describe("Text formatting options."),
      horizontalAlignment: z
        .enum(["LEFT", "CENTER", "RIGHT"])
        .optional()
        .describe("Horizontal alignment."),
    })
    .describe("Formatting options to apply."),
};

export const copySheetSchema = {
  sourceSpreadsheetId: z
    .string()
    .describe("The ID of the source spreadsheet containing the sheet to copy."),
  sheetId: z
    .number()
    .describe("The ID of the sheet to copy from the source spreadsheet."),
  destinationSpreadsheetId: z
    .string()
    .describe(
      "The ID of the destination spreadsheet where the sheet will be copied."
    ),
};

export const renameWorksheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  sheetId: z.number().describe("The ID of the worksheet to rename."),
  newTitle: z.string().describe("The new title for the worksheet."),
};

export const moveWorksheetSchema = {
  spreadsheetId: z.string().describe("The ID of the spreadsheet."),
  sheetId: z.number().describe("The ID of the worksheet to move."),
  newIndex: z
    .number()
    .min(0)
    .describe(
      "The new zero-based index position for the worksheet. 0 = first position, 1 = second position, etc."
    ),
};

// =============================================================================
// Tool Definitions - Static tool metadata for constants registry
// =============================================================================

export const GOOGLE_SHEETS_TOOLS: MCPToolType[] = [
  {
    name: "list_spreadsheets",
    description:
      "List Google Sheets spreadsheets accessible by the user from both personal drive and shared drives. Supports pagination and search.",
    inputSchema: zodToJsonSchema(
      z.object(listSpreadsheetsSchema)
    ) as JSONSchema7,
  },
  {
    name: "get_spreadsheet",
    description:
      "Get metadata and properties of a specific Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(getSpreadsheetSchema)) as JSONSchema7,
  },
  {
    name: "get_worksheet",
    description:
      "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(getWorksheetSchema)) as JSONSchema7,
  },
  {
    name: "update_cells",
    description: "Update cells in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(updateCellsSchema)) as JSONSchema7,
  },
  {
    name: "append_data",
    description: "Append data to a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(appendDataSchema)) as JSONSchema7,
  },
  {
    name: "clear_range",
    description: "Clear values from a range in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(clearRangeSchema)) as JSONSchema7,
  },
  {
    name: "create_spreadsheet",
    description: "Create a new Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(
      z.object(createSpreadsheetSchema)
    ) as JSONSchema7,
  },
  {
    name: "add_worksheet",
    description:
      "Add a new worksheet to an existing Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(addWorksheetSchema)) as JSONSchema7,
  },
  {
    name: "delete_worksheet",
    description: "Delete a worksheet from a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(
      z.object(deleteWorksheetSchema)
    ) as JSONSchema7,
  },
  {
    name: "format_cells",
    description: "Apply formatting to cells in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(formatCellsSchema)) as JSONSchema7,
  },
  {
    name: "copy_sheet",
    description:
      "Copy a sheet from one Google Sheets spreadsheet to another spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(copySheetSchema)) as JSONSchema7,
  },
  {
    name: "rename_worksheet",
    description: "Rename a worksheet in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(
      z.object(renameWorksheetSchema)
    ) as JSONSchema7,
  },
  {
    name: "move_worksheet",
    description:
      "Move a worksheet to a new position in a Google Sheets spreadsheet.",
    inputSchema: zodToJsonSchema(z.object(moveWorksheetSchema)) as JSONSchema7,
  },
];

// =============================================================================
// Server Info - Server metadata for the constants registry
// =============================================================================

export const GOOGLE_SHEETS_SERVER_INFO = {
  name: "google_sheets" as const,
  version: "1.0.0",
  description: "Work with spreadsheet data and tables.",
  authorization: {
    provider: "gmail" as const,
    supported_use_cases: [
      "personal_actions",
      "platform_actions",
    ] as MCPOAuthUseCase[],
    scope:
      "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly" as const,
  },
  icon: "GoogleSpreadsheetLogo" as const,
  documentationUrl: "https://docs.dust.tt/docs/google-sheets",
  instructions: null,
};

// =============================================================================
// Tool Stakes - Default permission levels for each tool
// =============================================================================

export const GOOGLE_SHEETS_TOOL_STAKES = {
  list_spreadsheets: "never_ask",
  get_spreadsheet: "never_ask",
  get_worksheet: "never_ask",
  update_cells: "low",
  append_data: "low",
  clear_range: "low",
  create_spreadsheet: "low",
  add_worksheet: "low",
  delete_worksheet: "low",
  format_cells: "low",
  copy_sheet: "low",
  rename_worksheet: "low",
  move_worksheet: "low",
} as const satisfies Record<string, MCPToolStakeLevelType>;
