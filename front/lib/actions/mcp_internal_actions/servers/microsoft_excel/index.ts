import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getDriveItemEndpoint,
  getGraphClient,
  parseCellRef,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import {
  clearRangeSchema,
  createWorksheetSchema,
  getWorksheetsSchema,
  listExcelFilesSchema,
  MICROSOFT_EXCEL_TOOL_NAME,
  readWorksheetSchema,
  writeWorksheetSchema,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft_excel/metadata";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// Session management for persistent Excel sessions
interface ExcelSession {
  sessionId: string;
  expiresAt: number;
}

// Cache key format: "userId:driveItemId" to prevent cross-user session sharing
const sessionCache = new Map<string, ExcelSession>();

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer(MICROSOFT_EXCEL_TOOL_NAME);

  /**
   * Create or get a persistent session for Excel operations
   */
  async function getExcelSession(
    client: Client,
    driveItemId: string,
    clientId: string
  ): Promise<string | null> {
    try {
      // Validate clientId is provided
      if (!clientId || clientId.trim() === "") {
        throw new Error("Client ID is required for session management");
      }

      // Create composite cache key to prevent cross-user session sharing
      const cacheKey = `${clientId}:${driveItemId}`;

      // Check cache
      const cached = sessionCache.get(cacheKey);
      if (cached) {
        if (cached.expiresAt > Date.now()) {
          return cached.sessionId;
        }
        // Remove expired entry
        sessionCache.delete(cacheKey);
      }

      // Create new persistent session
      const endpoint = await getDriveItemEndpoint(driveItemId);
      const response = await client
        .api(`${endpoint}/workbook/createSession`)
        .post({
          persistChanges: true,
        });

      const sessionId = response.id;
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      sessionCache.set(cacheKey, { sessionId, expiresAt });

      return sessionId;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // Session creation failed, proceed without session
      return null;
    }
  }

  /**
   * Make request with session header if available
   */
  async function makeExcelRequest<T>(
    client: Client,
    driveItemId: string,
    clientId: string,
    path: string,
    method: "get" | "post" | "patch" = "get",
    body?: unknown
  ): Promise<T> {
    const sessionId = await getExcelSession(client, driveItemId, clientId);
    const api = client.api(path);

    if (sessionId) {
      api.header("workbook-session-id", sessionId);
    }

    switch (method) {
      case "get":
        return api.get();
      case "post":
        return api.post(body);
      case "patch":
        return api.patch(body);
      default:
        throw new Error(`Unsupported method: ${method}`);
    }
  }

  server.tool(
    "list_excel_files",
    "List Excel files (.xlsx, .xlsm) from SharePoint or OneDrive.",
    listExcelFilesSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async ({ query }, { authInfo }) => {
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

          const response = await client
            .api("/search/query")

            .post(requestBody);

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
      }
    )
  );

  server.tool(
    "get_worksheets",
    "Get a list of all worksheets (sheets/tabs) in an Excel workbook stored in SharePoint.",
    getWorksheetsSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async ({ itemId, driveId, siteId }, { authInfo }) => {
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
            new MCPError(
              normalizeError(err).message || "Failed to get worksheets"
            )
          );
        }
      }
    )
  );

  server.tool(
    "read_worksheet",
    "Read data from a specific range or entire worksheet in an Excel file stored in SharePoint.",
    readWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async (
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
      }
    )
  );

  server.tool(
    "write_worksheet",
    "Write data to a specific range in an Excel worksheet stored in SharePoint.",
    writeWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async (
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
      }
    )
  );

  server.tool(
    "create_worksheet",
    "Create a new worksheet (sheet/tab) in an Excel workbook stored in SharePoint.",
    createWorksheetSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async ({ itemId, driveId, siteId, worksheetName }, { authInfo }) => {
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
      }
    )
  );

  server.tool(
    "clear_range",
    "Clear data from a specific range in an Excel worksheet stored in SharePoint.",
    clearRangeSchema,
    withToolLogging(
      auth,
      {
        toolNameForMonitoring: MICROSOFT_EXCEL_TOOL_NAME,
        agentLoopContext,
      },
      async (
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
              text: JSON.stringify(
                { success: true, clearedRange: range },
                null,
                2
              ),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(normalizeError(err).message || "Failed to clear range")
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
