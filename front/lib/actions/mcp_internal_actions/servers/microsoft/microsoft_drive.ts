import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type AdmZip from "adm-zip";
import { Readable } from "stream";
import { z } from "zod";

import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  extractTextFromDocx,
  getGraphClient,
  validateDocumentXml,
  validateZipFile,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import { makeInternalMCPServer } from "@app/lib/actions/mcp_internal_actions/utils";
import { withToolLogging } from "@app/lib/actions/mcp_internal_actions/wrappers";
import type { AgentLoopContextType } from "@app/lib/actions/types";
import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress";
import logger from "@app/logger/logger";
import {
  Err,
  isTextExtractionSupportedContentType,
  Ok,
  TextExtraction,
} from "@app/types";
import { normalizeError } from "@app/types/shared/utils/error_utils";

const MAX_CONTENT_SIZE = 32000; // Max characters to return for file content

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
    "update_word_document",
    "Update an existing Word document on OneDrive/SharePoint by providing a new document.xml content. Uses driveId if provided, otherwise falls back to siteId.",
    {
      itemId: z.string().describe("The ID of the Word document to update."),
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
      documentXml: z
        .string()
        .describe(
          "The updated document.xml content to replace in the Word document."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_drive", agentLoopContext },
      async ({ itemId, driveId, siteId, documentXml }, { authInfo }) => {
        const client = await getGraphClient(authInfo);
        if (!client) {
          return new Err(
            new MCPError("Failed to authenticate with Microsoft Graph")
          );
        }

        try {
          // Validate the XML content for security vulnerabilities
          const validationResult = validateDocumentXml(documentXml);
          if (!validationResult.isValid) {
            return new Err(
              new MCPError(
                `Invalid or potentially malicious XML content: ${validationResult.error}`
              )
            );
          }

          let endpoint: string;

          if (driveId) {
            endpoint = `/drives/${driveId}/items/${itemId}`;
          } else if (siteId) {
            endpoint = `/sites/${siteId}/drive/items/${itemId}`;
          } else {
            return new Err(
              new MCPError("Either driveId or siteId must be provided")
            );
          }

          // Get the file metadata
          const response = await client.api(endpoint).get();
          const downloadUrl = response["@microsoft.graph.downloadUrl"];
          const mimeType = response.file.mimeType;

          // Verify it's a Word document
          if (
            mimeType !==
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          ) {
            return new Err(
              new MCPError(
                `File is not a Word document. Mime type: ${mimeType}`
              )
            );
          }

          // Download the existing document
          const docResponse = await untrustedFetch(downloadUrl);
          const buffer = Buffer.from(await docResponse.arrayBuffer());

          // Validate ZIP file to prevent zip bomb attacks
          const zipValidation = validateZipFile(buffer);
          if (!zipValidation.isValid) {
            return new Err(
              new MCPError(
                `Invalid or potentially malicious ZIP file: ${zipValidation.error}`
              )
            );
          }

          // Unzip, replace document.xml, and rezip
          const zip = zipValidation.zip as AdmZip;
          zip.updateFile(
            "word/document.xml",
            Buffer.from(documentXml, "utf-8")
          );
          const updatedBuffer = zip.toBuffer();

          // Upload the modified document back
          const uploadEndpoint = `${endpoint}/content`;
          await client
            .api(uploadEndpoint)
            .header("Content-Type", mimeType)
            .put(updatedBuffer);

          return new Ok([
            {
              type: "text" as const,
              text: "Document updated successfully",
            },
          ]);
        } catch (err) {
          const internalError =
            normalizeError(err).message || "Failed to update document";
          logger.error(`update_word_document error: ${internalError}`);
          let errorMessage = "Failed to update document";

          if (
            internalError.includes("locked") ||
            internalError.includes("being uploaded")
          ) {
            errorMessage = `The document is currently locked (likely open in Word Online or being edited by another user).
              To resolve this issue, close the document in your browser/Word and try again.`;
          }

          return new Err(new MCPError(errorMessage));
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
      offset: z
        .number()
        .default(0)
        .describe(
          "Character offset to start reading from (for pagination). Defaults to 0."
        ),
      limit: z
        .number()
        .default(MAX_CONTENT_SIZE)
        .describe(
          `Maximum number of characters to return. Defaults to ${MAX_CONTENT_SIZE}.`
        ),
      getAsXml: z
        .boolean()
        .optional()
        .describe(
          "If true, the content will be returned as XML (for .docx file only). Otherwise, it will be returned as text/html. Must be true if you want to edit the document."
        ),
    },
    withToolLogging(
      auth,
      { toolNameForMonitoring: "microsoft_drive", agentLoopContext },
      async (
        { itemId, driveId, siteId, offset, limit, getAsXml },
        { authInfo }
      ) => {
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

          const docResponse = await untrustedFetch(downloadUrl);
          const buffer = Buffer.from(await docResponse.arrayBuffer());

          // Convert buffer to string based on mime type
          let content: string = "";

          if (mimeType.startsWith("text/")) {
            content = buffer.toString("utf-8");
          } else if (
            mimeType ===
              "application/vnd.openxmlformats-officedocument.wordprocessingml.document" &&
            getAsXml === true
          ) {
            // Handle .docx files by unzipping and extracting document.xml
            try {
              content = extractTextFromDocx(buffer);
            } catch (error) {
              return new Err(
                new MCPError(
                  `Failed to extract text from docx: ${normalizeError(error).message}`
                )
              );
            }
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

          // Apply offset and limit
          const totalContentLength = content.length;
          const startIndex = Math.max(0, offset);
          const endIndex = Math.min(content.length, startIndex + limit);
          const truncatedContent = content.slice(startIndex, endIndex);

          const hasMore = endIndex < content.length;
          const nextOffset = hasMore ? endIndex : undefined;

          return new Ok([
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  itemId,
                  driveId,
                  siteId,
                  fileName: response.name,
                  mimeType: mimeType,
                  content: truncatedContent,
                  returnedContentLength: truncatedContent.length,
                  totalContentLength,
                  offset: startIndex,
                  nextOffset,
                  hasMore,
                },
                null,
                2
              ),
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
