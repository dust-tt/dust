import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  withDriveAuth,
  withSheetsAuth,
} from "@app/lib/api/actions/servers/google_sheets/helpers";
import { GOOGLE_SHEETS_TOOLS_METADATA } from "@app/lib/api/actions/servers/google_sheets/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof GOOGLE_SHEETS_TOOLS_METADATA> = {
  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  list_spreadsheets: async ({ nameFilter, pageToken, pageSize }, extra) => {
    return withDriveAuth(extra, async (drive) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_spreadsheet: async ({ spreadsheetId }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  get_worksheet: async (
    { spreadsheetId, range, majorDimension, valueRenderOption },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  update_cells: async (
    { spreadsheetId, range, values, majorDimension, valueInputOption },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
          new MCPError(normalizeError(err).message || "Failed to update cells")
        );
      }
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  append_data: async (
    {
      spreadsheetId,
      range,
      values,
      majorDimension,
      valueInputOption,
      insertDataOption,
    },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  clear_range: async ({ spreadsheetId, range }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  create_spreadsheet: async ({ title, sheetTitles }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  add_worksheet: async (
    { spreadsheetId, title, rowCount, columnCount },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
          new MCPError(normalizeError(err).message || "Failed to add worksheet")
        );
      }
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  delete_worksheet: async ({ spreadsheetId, sheetId }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  format_cells: async (
    {
      spreadsheetId,
      sheetId,
      startRowIndex,
      endRowIndex,
      startColumnIndex,
      endColumnIndex,
      format,
    },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
          new MCPError(normalizeError(err).message || "Failed to format cells")
        );
      }
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  copy_sheet: async (
    { sourceSpreadsheetId, sheetId, destinationSpreadsheetId },
    extra
  ) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  rename_worksheet: async ({ spreadsheetId, sheetId, newTitle }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },

  // biome-ignore lint/suspicious/useAwait: ignored using `--suppress`
  move_worksheet: async ({ spreadsheetId, sheetId, newIndex }, extra) => {
    return withSheetsAuth(extra, async (sheets) => {
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
    });
  },
};

export const TOOLS = buildTools(GOOGLE_SHEETS_TOOLS_METADATA, handlers);
