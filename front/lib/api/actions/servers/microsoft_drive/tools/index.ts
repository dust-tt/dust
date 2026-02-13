import { MCPError } from "@app/lib/actions/mcp_errors";
import {
  downloadAndProcessMicrosoftFile,
  getDriveItemEndpoint,
  getGraphClient,
  searchMicrosoftDriveItems,
  validateDocumentXml,
  validateZipFile,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  getFileFromConversationAttachment,
  sanitizeFilename,
} from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { MICROSOFT_DRIVE_TOOLS_METADATA } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { untrustedFetch } from "@app/lib/egress/server";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type AdmZip from "adm-zip";

const handlers: ToolHandlers<typeof MICROSOFT_DRIVE_TOOLS_METADATA> = {
  search_in_files: async (
    { query, dataSource, maximumResults },
    { authInfo }
  ) => {
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
        maximumNumberOfResults: Math.min(maximumResults ?? 10, 25),
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
        new MCPError(normalizeError(err).message || "Failed to search files")
      );
    }
  },

  search_drive_items: async ({ query }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const response = await searchMicrosoftDriveItems({
        client,
        query,
      });

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
  },

  update_word_document: async (
    { itemId, driveId, siteId, documentXml },
    { authInfo }
  ) => {
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

      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

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
          new MCPError(`File is not a Word document. Mime type: ${mimeType}`)
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
      zip.updateFile("word/document.xml", Buffer.from(documentXml, "utf-8"));
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
      const originalError =
        normalizeError(err).message || "Failed to update document";
      let errorMessage = originalError;

      if (
        originalError.includes("locked") ||
        originalError.includes("being uploaded")
      ) {
        errorMessage = `The document is currently locked (likely open in Word Online or being edited by another user).
              To resolve this issue, close the document in your browser/Word and try again.
              Original error: ${originalError}`;
      }

      return new Err(new MCPError(errorMessage));
    }
  },

  get_file_content: async (
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
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

      const response = await client.api(endpoint).get();

      const downloadUrl = response["@microsoft.graph.downloadUrl"];
      const mimeType = response.file.mimeType;

      let content: string = "";
      try {
        content = await downloadAndProcessMicrosoftFile({
          downloadUrl,
          mimeType,
          fileName: response.name,
          extractAsXml: getAsXml,
        });
      } catch (error) {
        return new Err(
          new MCPError(
            `Failed to process file: ${normalizeError(error).message}`
          )
        );
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
  },

  upload_file: async (
    { fileId, driveId, siteId, folderPath, fileName },
    { auth, authInfo, agentLoopContext }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    if (!agentLoopContext) {
      return new Err(
        new MCPError("No conversation context available for file access")
      );
    }

    try {
      // Get the file from conversation attachment
      const fileResult = await getFileFromConversationAttachment(
        auth,
        fileId,
        agentLoopContext
      );

      if (fileResult.isErr()) {
        return new Err(new MCPError(fileResult.error));
      }

      const { buffer, filename, contentType } = fileResult.value;

      // Check file size limit (250MB for simple upload)
      const MAX_SIMPLE_UPLOAD_SIZE = 250 * 1024 * 1024; // 250MB
      if (buffer.length > MAX_SIMPLE_UPLOAD_SIZE) {
        return new Err(
          new MCPError(
            `File size (${(buffer.length / (1024 * 1024)).toFixed(2)}MB) exceeds the maximum limit of 250MB for simple upload. For larger files, use the resumable upload API.`
          )
        );
      }

      // Determine the upload endpoint
      const endpoint = await getDriveItemEndpoint(undefined, driveId, siteId);

      // If folderPath is provided, ensure the folder exists (create if needed)
      if (folderPath) {
        const folders = folderPath
          .split("/")
          .filter((f: string) => f.length > 0);
        let currentPath = "";
        let parentItemId = "root";

        for (const folder of folders) {
          currentPath = currentPath ? `${currentPath}/${folder}` : folder;

          try {
            // Try to get the folder
            const folderItem = await client
              .api(`${endpoint}/root:/${currentPath}`)
              .get();
            // Update parent item ID for next iteration
            parentItemId = folderItem.id;
          } catch (err) {
            const error = normalizeError(err);
            const isNotFound =
              error.message.toLowerCase().includes("could not be found") ||
              error.message.toLowerCase().includes("not found");

            if (isNotFound) {
              // Folder doesn't exist, create it
              try {
                const createdFolder = await client
                  .api(`${endpoint}/items/${parentItemId}/children`)
                  .post({
                    name: folder,
                    folder: {},
                    "@microsoft.graph.conflictBehavior": "fail",
                  });
                // Update parent item ID for next iteration
                parentItemId = createdFolder.id;
              } catch (createErr) {
                return new Err(
                  new MCPError(
                    `Failed to create folder '${folder}': ${normalizeError(createErr).message}`
                  )
                );
              }
            } else {
              return new Err(
                new MCPError(
                  `Failed to check folder '${currentPath}': ${normalizeError(err).message}`
                )
              );
            }
          }
        }
      }

      // Build the upload path
      const uploadFileName = sanitizeFilename(fileName ?? filename);
      // Reject if the original path contained traversal attempts
      if (folderPath?.includes("..")) {
        return new Err(
          new MCPError(
            "Invalid folder path: path traversal sequences are not allowed"
          )
        );
      }
      const uploadPath = folderPath
        ? `${folderPath}/${uploadFileName}`
        : uploadFileName;

      // Upload using PUT /drive/root:/{path}:/content
      const uploadEndpoint = `${endpoint}/root:/${encodeURIComponent(uploadPath)}:/content`;

      const response = await client
        .api(uploadEndpoint)
        .header("Content-Type", contentType)
        .put(buffer);

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              message: "File uploaded successfully",
              file: {
                id: response.id,
                name: response.name,
                size: response.size,
                webUrl: response.webUrl,
                createdDateTime: response.createdDateTime,
                lastModifiedDateTime: response.lastModifiedDateTime,
              },
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      const error = normalizeError(err);

      const errorMessage = error.message || "Failed to upload file";
      return new Err(new MCPError(errorMessage));
    }
  },

  copy_file: async (
    { itemId, driveId, siteId, parentItemId, name },
    { authInfo }
  ) => {
    if (!driveId && !siteId) {
      return new Err(new MCPError("Either driveId or siteId must be provided"));
    }

    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const sourceEndpoint = await getDriveItemEndpoint(
        itemId,
        driveId,
        siteId
      );

      const requestBody: { name: string; parentReference?: { id: string } } = {
        name,
      };

      if (parentItemId) {
        requestBody.parentReference = { id: parentItemId };
      }

      const response = (await client
        .api(`${sourceEndpoint}/copy`)
        .post(requestBody)) as {
        "@odata.location"?: string;
        location?: string;
      };

      const monitorUrl = response["@odata.location"] ?? response.location;

      const result = {
        status: "accepted",
        message: "Copy operation initiated successfully",
        fileName: name,
        monitorUrl,
        note: "The copy operation is asynchronous. Use the monitorUrl to check progress and get the final document ID, or use search_drive_items to find the document by name.",
      };

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(result, null, 2),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to copy file or folder"
        )
      );
    }
  },
};

export const TOOLS = buildTools(MICROSOFT_DRIVE_TOOLS_METADATA, handlers);
