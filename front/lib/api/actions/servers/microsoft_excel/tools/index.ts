import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getDriveItemEndpoint,
  getGraphClient,
  parseCellRef,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
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
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);
      let apiPath = `${endpoint}/workbook/worksheets/${encodeURIComponent(
        worksheetName
      )}`;

      if (range) {
        apiPath += `/range(address='${encodeURIComponent(range)}')`;
      } else {
        apiPath += "/usedRange";
      }

      const response = await makeExcelRequest(
        client,
        itemId,
        authInfo?.clientId ?? "",
        apiPath,
        "get"
      );

      return new Ok([
        { type: "text" as const, text: JSON.stringify(response, null, 2) },
      ]);
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
