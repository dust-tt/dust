import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getDriveItemEndpoint,
  getGraphClient,
  parseCellRef,
} from "@app/lib/api/actions/servers/microsoft/utils";
import { makeExcelRequest } from "@app/lib/api/actions/servers/microsoft_excel/helpers";
import { MICROSOFT_EXCEL_TOOLS_METADATA } from "@app/lib/api/actions/servers/microsoft_excel/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const handlers: ToolHandlers<typeof MICROSOFT_EXCEL_TOOLS_METADATA> = {
  list_excel_files: async ({ query }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const requestBody = {
        requests: [
          {
            entityTypes: ["driveItem"],
            query: {
              queryString: `${query.replace(/["'\\]/g, "").trim()} .xlsx`,
            },
          },
        ],
      };

      const response = await client.api("/search/query").post(requestBody);

      return new Ok([
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to list Excel files"
        )
      );
    }
  },

  get_worksheets: async ({ itemId, driveId, siteId }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

      const response = await makeExcelRequest(
        client,
        itemId,
        authInfo?.clientId ?? "",
        `${endpoint}/workbook/worksheets`,
        "get"
      );

      return new Ok([
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to get worksheets")
      );
    }
  },

  read_worksheet: async (
    { itemId, driveId, siteId, worksheetName, range },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const MAX_CELLS = 25_000;
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);
      const worksheetPath = `${endpoint}/workbook/worksheets/${encodeURIComponent(worksheetName)}`;

      let apiPath: string;

      if (range) {
        const rangeMatch = range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/i);
        if (!rangeMatch) {
          return new Err(
            new MCPError("Invalid range format. Use A1 notation like 'A1:D10'.")
          );
        }
        const start = parseCellRef(rangeMatch[1].toUpperCase());
        const end = parseCellRef(rangeMatch[2].toUpperCase());
        const cellCount = (end.row - start.row + 1) * (end.col - start.col + 1);
        if (cellCount > MAX_CELLS) {
          return new Err(
            new MCPError(
              `Range exceeds the ${MAX_CELLS.toLocaleString()} cell limit (requested ${cellCount.toLocaleString()}). Use a smaller range.`
            )
          );
        }
        apiPath = `${worksheetPath}/range(address='${encodeURIComponent(range)}')`;
      } else {
        const usedRangeInfo = await makeExcelRequest<{
          address?: string;
          rowCount?: number;
          columnCount?: number;
        }>(
          client,
          itemId,
          authInfo?.clientId ?? "",
          `${worksheetPath}/usedRange(valuesOnly=true)?$select=address,rowCount,columnCount`,
          "get"
        );
        const cellCount =
          (usedRangeInfo.rowCount ?? 0) * (usedRangeInfo.columnCount ?? 0);
        if (cellCount > MAX_CELLS) {
          return new Err(
            new MCPError(
              `The used range (${usedRangeInfo.address}) contains ${cellCount.toLocaleString()} cells, exceeding the ${MAX_CELLS.toLocaleString()} cell limit. Specify a range parameter to read a subset.`
            )
          );
        }
        apiPath = `${worksheetPath}/usedRange(valuesOnly=true)`;
      }

      const response = await makeExcelRequest<{
        values?: (string | number | boolean | null)[][];
      }>(client, itemId, authInfo?.clientId ?? "", apiPath, "get");

      const values = response.values ?? [];
      const csv = values
        .map((row) =>
          row
            .map((cell) => {
              if (cell === null || cell === undefined) {
                return "";
              }
              const str = String(cell);
              return str.includes(",") ||
                str.includes('"') ||
                str.includes("\n")
                ? `"${str.replace(/"/g, '""')}"`
                : str;
            })
            .join(",")
        )
        .join("\n");

      return new Ok([{ type: "text" as const, text: csv }]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to read worksheet data"
        )
      );
    }
  },

  write_worksheet: async (
    { itemId, driveId, siteId, worksheetName, range, data },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const rows = data.length;
      const cols = data[0]?.length || 0;

      if (rows === 0 || cols === 0) {
        return new Err(new MCPError("Data array cannot be empty"));
      }

      // Validate that all rows have the same length
      const rowLengths = data.map((row) => row.length);
      const uniqueLengths = new Set(rowLengths);
      if (uniqueLengths.size !== 1) {
        return new Err(
          new MCPError(
            "All rows must have the same number of columns. Please check the data dimensions."
          )
        );
      }

      // Parse range: either single cell or full range
      let targetRange: string;
      let startCell: string;
      let endCell: string;

      if (range.includes(":")) {
        // Full range (e.g., "A1:C5")
        const rangeMatch = range.match(/^([A-Z]+\d+):([A-Z]+\d+)$/);
        if (!rangeMatch) {
          return new Err(
            new MCPError(
              "Invalid range format. Use A1 notation like 'A1:C5' or 'A1'"
            )
          );
        }
        startCell = rangeMatch[1];
        endCell = rangeMatch[2];
        targetRange = range;
      } else {
        // Single cell (e.g., "A1") - convert to range like "A1:A1"
        const cellMatch = range.match(/^([A-Z]+\d+)$/);
        if (!cellMatch) {
          return new Err(
            new MCPError(
              "Invalid cell reference format. Use A1 notation like 'A1' or 'A1:C5'"
            )
          );
        }
        startCell = range;
        endCell = range;
        targetRange = `${range}:${range}`;
      }

      // Calculate range dimensions
      const start = parseCellRef(startCell);
      const end = parseCellRef(endCell);

      const rangeCols = end.col - start.col + 1;
      const rangeRows = end.row - start.row + 1;

      // Validate data dimensions match the range
      if (rows !== rangeRows || cols !== rangeCols) {
        return new Err(
          new MCPError(
            `Data dimensions (${rows} rows × ${cols} cols) do not match range dimensions (${rangeRows} rows × ${rangeCols} cols)`
          )
        );
      }

      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);
      const apiPath = `${endpoint}/workbook/worksheets/${encodeURIComponent(
        worksheetName
      )}/range(address='${encodeURIComponent(targetRange)}')`;

      const response = await makeExcelRequest(
        client,
        itemId,
        authInfo?.clientId ?? "",
        apiPath,
        "patch",
        { values: data }
      );

      return new Ok([
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to write worksheet data"
        )
      );
    }
  },

  create_worksheet: async (
    { itemId, driveId, siteId, worksheetName },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

      const apiPath = `${endpoint}/workbook/worksheets/add`;

      const response = await makeExcelRequest(
        client,
        itemId,
        authInfo?.clientId ?? "",
        apiPath,
        "post",
        { name: worksheetName }
      );

      return new Ok([
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to create worksheet"
        )
      );
    }
  },

  clear_range: async (
    { itemId, driveId, siteId, worksheetName, range, applyTo },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

      const apiPath = `${endpoint}/workbook/worksheets/${encodeURIComponent(
        worksheetName
      )}/range(address='${encodeURIComponent(range)}')/clear`;

      await makeExcelRequest(
        client,
        itemId,
        authInfo?.clientId ?? "",
        apiPath,
        "post",
        {
          applyTo,
        }
      );

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify({ success: true, clearedRange: range }, null, 2),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to clear range")
      );
    }
  },
};

export const TOOLS = buildTools(MICROSOFT_EXCEL_TOOLS_METADATA, handlers);
