import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { google } from "googleapis";
import { z } from "zod";

import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const createServer = (): McpServer => {
  const server = makeInternalMCPServer("google_sheets");

  async function getSheetsClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.sheets({
      version: "v4",
      auth: oauth2Client,
    });
  }

  async function getDriveClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }

    const oauth2Client = new google.auth.OAuth2();
    oauth2Client.setCredentials({ access_token: accessToken });
    return google.drive({
      version: "v3",
      auth: oauth2Client,
    });
  }

  server.tool(
    "list_spreadsheets",
    "List Google Sheets spreadsheets accessible by the user from both personal drive and shared drives. Supports pagination and search.",
    {
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
    async ({ nameFilter, pageToken, pageSize }, { authInfo }) => {
      const drive = await getDriveClient(authInfo);
      if (!drive) {
        return makeMCPToolTextError("Failed to authenticate with Google Drive");
      }

      try {
        const query = nameFilter
          ? `mimeType='application/vnd.google-apps.spreadsheet' and name contains '${nameFilter}'`
          : "mimeType='application/vnd.google-apps.spreadsheet'";

        const res = await drive.files.list({
          q: query,
          pageToken,
          pageSize: pageSize ? Math.min(pageSize, 1000) : undefined,
          fields:
            "nextPageToken, files(id, name, createdTime, modifiedTime, owners, webViewLink)",
          includeItemsFromAllDrives: true,
          supportsAllDrives: true,
          corpora: "allDrives",
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to list spreadsheets"
        );
      }
    }
  );

  server.tool(
    "get_spreadsheet",
    "Get metadata and properties of a specific Google Sheets spreadsheet.",
    {
      spreadsheetId: z
        .string()
        .describe("The ID of the spreadsheet to retrieve."),
      includeGridData: z
        .boolean()
        .default(false)
        .describe("Whether to include grid data in the response."),
    },
    async ({ spreadsheetId, includeGridData }, { authInfo }) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.get({
          spreadsheetId,
          includeGridData,
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to get spreadsheet"
        );
      }
    }
  );

  server.tool(
    "get_worksheet",
    "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    {
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
    async (
      { spreadsheetId, range, majorDimension, valueRenderOption },
      { authInfo }
    ) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range,
          majorDimension,
          valueRenderOption,
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to get worksheet data"
        );
      }
    }
  );

  server.tool(
    "update_cells",
    "Update cells in a Google Sheets spreadsheet.",
    {
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
    async (
      { spreadsheetId, range, values, majorDimension, valueInputOption },
      { authInfo }
    ) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.values.update({
          spreadsheetId,
          range,
          valueInputOption,
          requestBody: {
            values,
            majorDimension,
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to update cells"
        );
      }
    }
  );

  server.tool(
    "append_data",
    "Append data to a Google Sheets spreadsheet.",
    {
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
    async (
      {
        spreadsheetId,
        range,
        values,
        majorDimension,
        valueInputOption,
        insertDataOption,
      },
      { authInfo }
    ) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.values.append({
          spreadsheetId,
          range,
          valueInputOption,
          insertDataOption,
          requestBody: {
            values,
            majorDimension,
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to append data"
        );
      }
    }
  );

  server.tool(
    "clear_range",
    "Clear values from a range in a Google Sheets spreadsheet.",
    {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      range: z
        .string()
        .describe(
          "The A1 notation of the range to clear (e.g., 'Sheet1!A1:D10')."
        ),
    },
    async ({ spreadsheetId, range }, { authInfo }) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.values.clear({
          spreadsheetId,
          range,
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to clear range"
        );
      }
    }
  );

  server.tool(
    "create_spreadsheet",
    "Create a new Google Sheets spreadsheet.",
    {
      title: z.string().describe("The title of the new spreadsheet."),
      sheetTitles: z
        .array(z.string())
        .optional()
        .describe(
          "Titles for initial sheets. If not provided, creates one sheet with default title."
        ),
    },
    async ({ title, sheetTitles }, { authInfo }) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const sheetsToCreate = sheetTitles?.map((sheetTitle) => ({
          properties: { title: sheetTitle },
        // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        })) || [{ properties: { title: "Sheet1" } }];

        const res = await sheets.spreadsheets.create({
          requestBody: {
            properties: { title },
            sheets: sheetsToCreate,
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to create spreadsheet"
        );
      }
    }
  );

  server.tool(
    "add_worksheet",
    "Add a new worksheet to an existing Google Sheets spreadsheet.",
    {
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
    async ({ spreadsheetId, title, rowCount, columnCount }, { authInfo }) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                addSheet: {
                  properties: {
                    title,
                    gridProperties: {
                      rowCount,
                      columnCount,
                    },
                  },
                },
              },
            ],
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to add worksheet"
        );
      }
    }
  );

  server.tool(
    "delete_worksheet",
    "Delete a worksheet from a Google Sheets spreadsheet.",
    {
      spreadsheetId: z.string().describe("The ID of the spreadsheet."),
      sheetId: z.number().describe("The ID of the worksheet to delete."),
    },
    async ({ spreadsheetId, sheetId }, { authInfo }) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                deleteSheet: {
                  sheetId,
                },
              },
            ],
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to delete worksheet"
        );
      }
    }
  );

  server.tool(
    "format_cells",
    "Apply formatting to cells in a Google Sheets spreadsheet.",
    {
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
    async (
      {
        spreadsheetId,
        sheetId,
        startRowIndex,
        endRowIndex,
        startColumnIndex,
        endColumnIndex,
        format,
      },
      { authInfo }
    ) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.batchUpdate({
          spreadsheetId,
          requestBody: {
            requests: [
              {
                repeatCell: {
                  range: {
                    sheetId,
                    startRowIndex,
                    endRowIndex,
                    startColumnIndex,
                    endColumnIndex,
                  },
                  cell: {
                    userEnteredFormat: format,
                  },
                  fields: "userEnteredFormat",
                },
              },
            ],
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to format cells"
        );
      }
    }
  );

  server.tool(
    "copy_sheet",
    "Copy a sheet from one Google Sheets spreadsheet to another spreadsheet.",
    {
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
    async (
      { sourceSpreadsheetId, sheetId, destinationSpreadsheetId },
      { authInfo }
    ) => {
      const sheets = await getSheetsClient(authInfo);
      if (!sheets) {
        return makeMCPToolTextError(
          "Failed to authenticate with Google Sheets"
        );
      }

      try {
        const res = await sheets.spreadsheets.sheets.copyTo({
          spreadsheetId: sourceSpreadsheetId,
          sheetId: sheetId,
          requestBody: {
            destinationSpreadsheetId: destinationSpreadsheetId,
          },
        });

        return makeMCPToolJSONSuccess({
          result: res.data,
        });
      } catch (err) {
        return makeMCPToolTextError(
          normalizeError(err).message || "Failed to copy sheet"
        );
      }
    }
  );

  return server;
};

export default createServer;
