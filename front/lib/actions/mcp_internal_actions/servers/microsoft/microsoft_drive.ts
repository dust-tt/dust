import type { Client } from "@microsoft/microsoft-graph-client";
import { Client as GraphClient } from "@microsoft/microsoft-graph-client";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  makeInternalMCPServer,
  makeMCPToolJSONSuccess,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import { Err, Ok } from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const createServer = (auth: any): McpServer => {
  const server = makeInternalMCPServer("microsoft_drive");

  async function getGraphClient(authInfo?: AuthInfo): Promise<Client | null> {
    const accessToken = authInfo?.token;
    if (!accessToken) {
      return null;
    }

    return GraphClient.init({
      authProvider: (done) => done(null, accessToken),
    });
  }

  server.tool(
    "search_files",
    "Search in files in Microsoft OneDrive and SharePoint using Microsoft Copilot retrieval API.",
    {
      query: z
        .string()
        .describe("Search query to find relevant files and content."),
      dataSource: z
        .enum(["oneDriveBusiness", "Sharepoint", "externalItem"])
        .describe(
          "Specific data source to search in (must be among 'oneDriveBusiness', 'Sharepoint', 'externalItem')."
        ),
      maximumResults: z
        .number()
        .optional()
        .default(10)
        .describe("Maximum number of results to return (max 25)."),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft" },
      async ({ query, dataSource, maximumResults }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const endpoint = `/copilot/retrieval`;

          const requestBody = {
            queryString: query,
            dataSource,
            maximumNumberOfResults: Math.min(maximumResults || 10, 25),
            resourceMetadata: ["title", "author"],
          };

          const response = await client
            .api(endpoint)
            .version("beta")
            .post(requestBody);
          return new Ok(
            makeMCPToolJSONSuccess({
              result: response.retrievalHits,
            }).content
          );
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to search files"
            )
          );
        }
      }
    )
  );

  return server;
};

export default createServer;
