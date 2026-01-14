import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  addWorksheetSchema,
  appendDataSchema,
  clearRangeSchema,
  copySheetSchema,
  createSpreadsheetSchema,
  deleteWorksheetSchema,
  formatCellsSchema,
  getSpreadsheetSchema,
  getWorksheetSchema,
  GOOGLE_SHEETS_TOOL_NAME,
  listSpreadsheetsSchema,
  moveWorksheetSchema,
  renameWorksheetSchema,
  updateCellsSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/google_sheets/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import {
  getGoogleDriveClient,
  getGoogleSheetsClient,
} from "@app/lib/providers/google_drive/utils";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("google_sheets");

  async function getDriveClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }
    return getGoogleDriveClient(accessToken);
  }

  async function getSheetsClient(authInfo?: AuthInfo) {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }
    return getGoogleSheetsClient(accessToken);
  }

  server.tool(
    "list_spreadsheets",
    "List Google Sheets spreadsheets accessible by the user from both personal drive and shared drives. Supports pagination and search.",
    listSpreadsheetsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ nameFilter, pageToken, pageSize }, { authInfo }) => {
        const drive = await getDriveClient(authInfo);
        if (!drive) {
          return new Err(
            new MCPError("Failed to authenticate with Google Drive")
          );
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to list spreadsheets"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_spreadsheet",
    "Get metadata and properties of a specific Google Sheets spreadsheet.",
    getSpreadsheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.get({
            spreadsheetId,
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to get spreadsheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_worksheet",
    "Get data from a specific worksheet in a Google Sheets spreadsheet.",
    getWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { spreadsheetId, range, majorDimension, valueRenderOption },
        { authInfo }
      ) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.values.get({
            spreadsheetId,
            range,
            majorDimension,
            valueRenderOption,
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to get worksheet data"
            )
          );
        }
      }
    )
  );

  server.tool(
    "update_cells",
    "Update cells in a Google Sheets spreadsheet.",
    updateCellsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { spreadsheetId, range, values, majorDimension, valueInputOption },
        { authInfo }
      ) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to update cells"
            )
          );
        }
      }
    )
  );

  server.tool(
    "append_data",
    "Append data to a Google Sheets spreadsheet.",
    appendDataSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
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
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to append data")
          );
        }
      }
    )
  );

  server.tool(
    "clear_range",
    "Clear values from a range in a Google Sheets spreadsheet.",
    clearRangeSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId, range }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.values.clear({
            spreadsheetId,
            range,
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to clear range")
          );
        }
      }
    )
  );

  server.tool(
    "create_spreadsheet",
    "Create a new Google Sheets spreadsheet.",
    createSpreadsheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ title, sheetTitles }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to create spreadsheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "add_worksheet",
    "Add a new worksheet to an existing Google Sheets spreadsheet.",
    addWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId, title, rowCount, columnCount }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to add worksheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "delete_worksheet",
    "Delete a worksheet from a Google Sheets spreadsheet.",
    deleteWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId, sheetId }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to delete worksheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "format_cells",
    "Apply formatting to cells in a Google Sheets spreadsheet.",
    formatCellsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
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
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to format cells"
            )
          );
        }
      }
    )
  );

  server.tool(
    "copy_sheet",
    "Copy a sheet from one Google Sheets spreadsheet to another spreadsheet.",
    copySheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async (
        { sourceSpreadsheetId, sheetId, destinationSpreadsheetId },
        { authInfo }
      ) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
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

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to copy sheet")
          );
        }
      }
    )
  );

  server.tool(
    "rename_worksheet",
    "Rename a worksheet in a Google Sheets spreadsheet.",
    renameWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId, sheetId, newTitle }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId,
                      title: newTitle,
                    },
                    fields: "title",
                  },
                },
              ],
            },
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to rename worksheet"
            )
          );
        }
      }
    )
  );

  server.tool(
    "move_worksheet",
    "Move a worksheet to a new position in a Google Sheets spreadsheet.",
    moveWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: GOOGLE_SHEETS_TOOL_NAME,
        agentLoopContext,
      },
      async ({ spreadsheetId, sheetId, newIndex }, { authInfo }) => {
        const sheets = await getSheetsClient(authInfo);
        if (!sheets) {
          return new Err(
            new MCPError("Failed to authenticate with Google Sheets")
          );
        }

        try {
          const res = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            requestBody: {
              requests: [
                {
                  updateSheetProperties: {
                    properties: {
                      sheetId,
                      index: newIndex,
                    },
                    fields: "index",
                  },
                },
              ],
            },
          });

          return new Ok([
            { type: "text" as const, text: JSON.stringify(res.data, null, 2) },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to move worksheet"
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
