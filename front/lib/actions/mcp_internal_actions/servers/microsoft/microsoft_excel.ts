import type { Client } from "@microsoft/microsoft-graph-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  getDriveItemEndpoint,
  getGraphClient,
  parseCellRef,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import type { Authenticator } from "@app/lib/auth";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

// We use a single tool name for monitoring given the high granularity (can be revisited).
const MICROSOFT_EXCEL_TOOL_NAME = "microsoft_excel";

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
  const server = makeInternalMCPServer("microsoft_excel");

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
    {
      query: z
        .string()
        .describe(
          "Search query to find relevant files and content in OneDrive and SharePoint."
        ),
    },
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
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    {
      itemId: z
        .string()
        .describe("The ID of the Excel file to get worksheets from."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the file. Used if driveId is not provided."
        ),
    },
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
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    {
      itemId: z.string().describe("The ID of the Excel file to read from."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the file. Used if driveId is not provided."
        ),
      worksheetName: z
        .string()
        .describe("Name of the worksheet to read from (e.g., 'Sheet1')"),
      range: z
        .string()
        .optional()
        .describe(
          "Optional cell range in A1 notation (e.g., 'A1:D10'). If not provided, reads the used range."
        ),
    },
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
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    {
      itemId: z.string().describe("The ID of the Excel file to write to."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the file. Used if driveId is not provided."
        ),
      worksheetName: z
        .string()
        .describe("Name of the worksheet to write to (e.g., 'Sheet1')"),
      range: z
        .string()
        .describe(
          "Target range in A1 notation. Can be either a single cell (e.g., 'A1', 'B5') or a full range (e.g., 'A1:C10'). Data dimensions must match the range size."
        ),
      data: z
        .array(
          z.array(z.union([z.string(), z.number(), z.boolean(), z.null()]))
        )
        .describe(
          "2D array of data to write. Each inner array represents a row, and all rows must have the same length. Example: [['Name', 'Age'], ['John', 30], ['Jane', 25]]"
        ),
    },
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
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    {
      itemId: z
        .string()
        .describe("The ID of the Excel file to create a worksheet in."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the file. Used if driveId is not provided."
        ),
      worksheetName: z
        .string()
        .describe("Name for the new worksheet (e.g., 'Q4 Results')"),
    },
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
              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
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
    {
      itemId: z
        .string()
        .describe("The ID of the Excel file to clear the range in."),
      driveId: z
        .string()
        .optional()
        .describe(
          "The ID of the drive containing the file. Takes priority over siteId if provided."
        ),
      siteId: z
        .string()
        .optional()
        .describe(
          "The ID of the SharePoint site containing the file. Used if driveId is not provided."
        ),
      worksheetName: z
        .string()
        .describe("Name of the worksheet (e.g., 'Sheet1')"),
      range: z
        .string()
        .describe("Cell range to clear in A1 notation (e.g., 'A1:D10')"),
      applyTo: z
        .enum(["All", "Contents", "Formats"])
        .default("Contents")
        .describe(
          "What to clear: 'All' (values and formatting), 'Contents' (values only), 'Formats' (formatting only)"
        ),
    },
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
            // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
            new MCPError(normalizeError(err).message || "Failed to clear range")
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
