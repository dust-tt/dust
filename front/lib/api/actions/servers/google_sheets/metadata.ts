import type { ServerMetadata } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { createToolsRecord } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import type { JSONSchema7 as JSONSchema } from "json-schema";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

export const GOOGLE_SHEETS_TOOL_NAME = "google_sheets" as const;

export const GOOGLE_SHEETS_TOOLS_METADATA = createToolsRecord({
  list_spreadsheets: {
    description:
      "List Google Sheets spreadsheets accessible by the user from both personal drive and shared drives. Supports pagination and search.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Listing Google Sheets spreadsheets",
      done: "List Google Sheets spreadsheets",
    },
  },
  get_spreadsheet: {
    description:
      "Get metadata and properties of a specific Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z
        .string()
        .describe("The ID of the spreadsheet to retrieve."),
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Google Sheets spreadsheet",
      done: "Get Google Sheets spreadsheet",
    },
  },
  get_worksheet: {
    description:
      "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    schema: {
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
    },
    stake: "never_ask",
    displayLabels: {
      running: "Getting Google Sheets worksheet",
      done: "Get Google Sheets worksheet",
    },
  },
  update_cells: {
    description: "Update cells in a Google Sheets spreadsheet.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Updating Google Sheets cells",
      done: "Update Google Sheets cells",
    },
  },
  append_data: {
    description: "Append data to a Google Sheets spreadsheet.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Appending data to Google Sheets",
      done: "Append data to Google Sheets",
    },
  },
  clear_range: {
    description: "Clear values from a range in a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      range: z
        .string()
        .describe(
          "The A1 notation of the range to clear (e.g., 'Sheet1!A1:D10')."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Clearing Google Sheets range",
      done: "Clear Google Sheets range",
    },
  },
  create_spreadsheet: {
    description: "Create a new Google Sheets spreadsheet.",
    schema: {
      title: z.string().describe("The title of the new spreadsheet."),
      sheetTitles: z
        .array(z.string())
        .optional()
        .describe(
          "Titles for initial sheets. If not provided, creates one sheet with default title."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Creating Google Sheets spreadsheet",
      done: "Create Google Sheets spreadsheet",
    },
  },
  add_worksheet: {
    description:
      "Add a new worksheet to an existing Google Sheets spreadsheet.",
    schema: {
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
    },
    stake: "low",
    displayLabels: {
      running: "Adding Google Sheets worksheet",
      done: "Add Google Sheets worksheet",
    },
  },
  delete_worksheet: {
    description: "Delete a worksheet from a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      sheetId: z.number().describe("The ID of the worksheet to delete."),
    },
    stake: "low",
    displayLabels: {
      running: "Deleting Google Sheets worksheet",
      done: "Delete Google Sheets worksheet",
    },
  },
  format_cells: {
    description: "Apply formatting to cells in a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      sheetId: z.number().describe("The ID of the worksheet to format."),
      startRowIndex: z.number().describe("The start row index (0-based)."),
      endRowIndex: z.number().describe("The end row index (exclusive)."),
      startColumnIndex: z
        .number()
        .describe("The start column index (0-based)."),
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
    },
    stake: "low",
    displayLabels: {
      running: "Formatting Google Sheets cells",
      done: "Format Google Sheets cells",
    },
  },
  copy_sheet: {
    description:
      "Copy a sheet from one Google Sheets spreadsheet to another spreadsheet.",
    schema: {
      sourceSpreadsheetId: z
        .string()
        .describe(
          "The ID of the source spreadsheet containing the sheet to copy."
        ),
      sheetId: z
        .number()
        .describe("The ID of the sheet to copy from the source spreadsheet."),
      destinationSpreadsheetId: z
        .string()
        .describe(
          "The ID of the destination spreadsheet where the sheet will be copied."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Copying Google Sheets sheet",
      done: "Copy Google Sheets sheet",
    },
  },
  rename_worksheet: {
    description: "Rename a worksheet in a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      sheetId: z.number().describe("The ID of the worksheet to rename."),
      newTitle: z.string().describe("The new title for the worksheet."),
    },
    stake: "low",
    displayLabels: {
      running: "Renaming Google Sheets worksheet",
      done: "Rename Google Sheets worksheet",
    },
  },
  move_worksheet: {
    description:
      "Move a worksheet to a new position in a Google Sheets spreadsheet.",
    schema: {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      sheetId: z.number().describe("The ID of the worksheet to move."),
      newIndex: z
        .number()
        .min(0)
        .describe(
          "The new zero-based index position for the worksheet. 0 = first position, 1 = second position, etc."
        ),
    },
    stake: "low",
    displayLabels: {
      running: "Moving Google Sheets worksheet",
      done: "Move Google Sheets worksheet",
    },
  },
});

export const GOOGLE_SHEETS_SERVER = {
  serverInfo: {
    name: "google_sheets",
    version: "1.0.0",
    description: "Work with spreadsheet data and tables.",
    authorization: {
      provider: "gmail" as const,
      supported_use_cases: ["personal_actions", "platform_actions"] as const,
      scope:
        "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.readonly" as const,
    },
    icon: "GoogleSpreadsheetLogo",
    documentationUrl: "https://docs.dust.tt/docs/google-sheets",
    instructions: null,
  },
  tools: Object.values(GOOGLE_SHEETS_TOOLS_METADATA).map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: zodToJsonSchema(z.object(t.schema)) as JSONSchema,
    displayLabels: t.displayLabels,
  })),
  tools_stakes: Object.fromEntries(
    Object.values(GOOGLE_SHEETS_TOOLS_METADATA).map((t) => [t.name, t.stake])
  ),
} as const satisfies ServerMetadata;
