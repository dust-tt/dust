import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Readable } from "stream";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import { getGraphClient } from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import logger from "@app/logger/logger";
import {
  Err,
  isTextExtractionSupportedContentType,
  Ok,
  TextExtraction,
} from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

function createServer(
  auth: Authenticator,
  agentLoopContext?: AgentLoopContextType
): McpServer {
  const server = makeInternalMCPServer("microsoft_drive");

  server.tool(
    "search_in_files",
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
      { toolNameForMonitoring: "microsoft_drive", agentLoopContext },
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
          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.retrievalHits, null, 2),
            },
          ]);
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

  server.tool(
    "search_drive_items",
    "Search OneDrive and SharePoint content using Microsoft Graph Search API to find relevant files and documents. This tool returns the results in relevance order.",
    {
      query: z
        .string()
        .describe(
          "Search query to find relevant files and content in OneDrive and SharePoint."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_drive", agentLoopContext },
      async ({ query }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          const endpoint = `/search/query`;

          const requestBody = {
            requests: [
              {
                entityTypes: ["driveItem"],
                query: {
                  queryString: query,
                },
              },
            ],
          };

          const response = await client.api(endpoint).post(requestBody);

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(response.value[0].hitsContainers, null, 2),
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to search drive items"
            )
          );
        }
      }
    )
  );

  server.tool(
    "get_file_content",
    "Retrieve the content of files from SharePoint/OneDrive (Powerpoint, Word, Excel, etc.). Uses driveId if provided, otherwise falls back to siteId.",
    {
      itemId: z
        .string()
        .describe("The ID of the file item to retrieve content from."),
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
      { toolNameForMonitoring: "microsoft_drive", agentLoopContext },
      async ({ itemId, driveId, siteId }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          let endpoint: string;

          if (driveId) {
            // Use driveId if provided (takes priority)
            endpoint = `/drives/${driveId}/items/${itemId}`;
          } else if (siteId) {
            // Fall back to siteId if driveId is not provided
            endpoint = `/sites/${siteId}/drive/items/${itemId}`;
          } else {
            return new Err(
              new MCPError("Either driveId or siteId must be provided")
            );
          }

          const response = await client.api(endpoint).get();

          const downloadUrl = response["@microsoft.graph.downloadUrl"];
          const mimeType = response.file.mimeType;

          const docResponse = await fetch(downloadUrl);
          const buffer = Buffer.from(await docResponse.arrayBuffer());

          // Convert buffer to string based on mime type
          let content: string = "";

          if (mimeType.startsWith("text/")) {
            content = buffer.toString("utf-8");
          } else if (isTextExtractionSupportedContentType(mimeType)) {
            try {
              const textExtraction = new TextExtraction(
                config.getTextExtractionUrl(),
                {
                  enableOcr: true,
                  logger,
                }
              );

              const bufferStream = Readable.from(buffer);
              const textStream = await textExtraction.fromStream(
                bufferStream,
                mimeType as Parameters<typeof textExtraction.fromStream>[1]
              );

              const chunks: string[] = [];
              for await (const chunk of textStream) {
                chunks.push(chunk.toString());
              }

              content = chunks.join("");
            } catch (error) {
              return new Err(
                new MCPError(
                  `Failed to extract text: ${normalizeError(error).message}`
                )
              );
            }
          } else {
            return new Err(new MCPError(`Unsupported mime type: ${mimeType}`));
          }
          return new Ok([
            {
              type: "text" as const,
              text: content,
            },
          ]);
        } catch (err) {
          return new Err(
            new MCPError(
              normalizeError(err).message || "Failed to retrieve file content"
            )
          );
        }
      }
    )
  );

  return server;
}

export default createServer;
