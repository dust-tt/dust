import { isBinaryWithinFileOffloadLimit } from "@app/lib/actions/action_output_limits";
import { MCPError } from "@app/lib/actions/mcp_errors";
import type { ToolHandlers } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import { buildTools } from "@app/lib/actions/mcp_internal_actions/tool_definition";
import {
  isTextReadableContentType,
  paginateText,
  readFileText,
} from "@app/lib/actions/mcp_internal_actions/utils/attachment_processing";
import {
  getFileFromConversationAttachment,
  sanitizeFilename,
} from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import { isAgentLoopRunContext } from "@app/lib/actions/types";
import {
  downloadAndProcessMicrosoftFile,
  downloadDriveItemAsBuffer,
  getAllowedLabelsForMCPServer,
  getDriveItemEndpoint,
  getGraphClient,
  searchMicrosoftDriveItems,
  validateDocumentXml,
  validateZipFile,
} from "@app/lib/api/actions/servers/microsoft/utils";
import { MICROSOFT_DRIVE_TOOLS_METADATA } from "@app/lib/api/actions/servers/microsoft_drive/metadata";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type AdmZip from "adm-zip";
import assert from "assert";
import { z } from "zod";

const driveChildItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  webUrl: z.string().optional(),
  size: z.number().optional(),
  folder: z.object({ childCount: z.number().optional() }).optional(),
  file: z.object({ mimeType: z.string().optional() }).optional(),
  parentReference: z
    .object({
      driveId: z.string().optional(),
      id: z.string().optional(),
      path: z.string().optional(),
    })
    .optional(),
  createdDateTime: z.string().optional(),
  lastModifiedDateTime: z.string().optional(),
});

const MAX_FILE_SIZE_BYTES = 64 * 1024 * 1024;
const FILE_TOO_LARGE_TO_ATTACH_ERROR =
  "File is too large to be attached to the conversation and has no readable text content.";

function buildFileContentBlock({
  itemId,
  driveId,
  siteId,
  fileName,
  mimeType,
  content,
  offset,
  limit,
}: {
  itemId: string;
  driveId: string | undefined;
  siteId: string | undefined;
  fileName: string;
  mimeType: string;
  content: string;
  offset: number;
  limit: number;
}) {
  return {
    type: "text" as const,
    text: JSON.stringify(
      {
        itemId,
        driveId,
        siteId,
        fileName,
        mimeType,
        ...paginateText({ text: content, offset, limit }),
      },
      null,
      2
    ),
  };
}

/**
 * @cc [owner:tdraier,label:mcp;performance] file-size-checked-before-download
 * `get_file_content` MUST return an error without downloading the file when its Graph `size`
 * exceeds `MAX_FILE_SIZE_BYTES`, or when the file has no readable text and its `size` exceeds the
 * file offload limit.
 */
/**
 * @cc [owner:tdraier,label:mcp;performance] content-paginated
 * The text block returned by `get_file_content` MUST hold at most `limit` characters of the file
 * content, starting at `offset`, whether or not `getAsXml` is set.
 */
/**
 * @cc [owner:tdraier,label:mcp;performance] binary-attached-once-within-offload-limit
 * `get_file_content` MUST only return the file's binary resource block when it fits the file
 * offload limit, and, for files with readable text, only on the first page (`offset` 0).
 */
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

  search_drive_items: async ({ query }, { auth, authInfo, runContext }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    const allowedLabels = await getAllowedLabelsForMCPServer(auth, {
      runContext,
    });

    try {
      const response = await searchMicrosoftDriveItems({
        client,
        query,
        allowedLabels,
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

  list_drive_items: async (
    { driveId, siteId, parentFolderId, itemType = "all", top, skipToken },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const baseEndpoint = await getDriveItemEndpoint(
        parentFolderId,
        driveId,
        siteId
      );
      const endpoint = parentFolderId
        ? `${baseEndpoint}/children`
        : `${baseEndpoint}/root/children`;

      const pageSize = Math.min(Math.max(top ?? 50, 1), 200);

      let request = client
        .api(endpoint)
        .select(
          "id,name,webUrl,folder,file,size,parentReference,createdDateTime,lastModifiedDateTime"
        )
        .top(pageSize);
      if (skipToken) {
        request = request.query({ $skiptoken: skipToken });
      }

      const response = await request.get();

      const parsedItems = z
        .array(driveChildItemSchema)
        .safeParse(response.value ?? []);
      if (!parsedItems.success) {
        return new Err(
          new MCPError(
            `Unexpected response shape from Microsoft Graph: ${parsedItems.error.message}`
          )
        );
      }

      const items = parsedItems.data
        .filter(
          (item) =>
            itemType === "all" ||
            (itemType === "folder" && item.folder) ||
            (itemType === "file" && item.file)
        )
        .map((item) => ({
          id: item.id,
          name: item.name,
          type: item.folder ? "folder" : "file",
          webUrl: item.webUrl,
          size: item.size,
          childCount: item.folder?.childCount,
          mimeType: item.file?.mimeType,
          parentReference: item.parentReference,
          createdDateTime: item.createdDateTime,
          lastModifiedDateTime: item.lastModifiedDateTime,
        }));

      const nextLink: string | undefined = response["@odata.nextLink"];
      let nextSkipToken: string | undefined;
      if (nextLink) {
        try {
          nextSkipToken =
            new URL(nextLink).searchParams.get("$skiptoken") ?? undefined;
        } catch {
          // Unparseable nextLink — leave undefined; caller can re-list.
        }
      }

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              items,
              count: items.length,
              nextSkipToken,
              hasMore: !!nextSkipToken,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to list drive items"
        )
      );
    }
  },

  get_item_from_url: async ({ url }, { authInfo }) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      // Graph shares API: any OneDrive/SharePoint URL (including sharing
      // links) is addressable as a share id of the form "u!" + base64url(url).
      const shareId = `u!${Buffer.from(url)
        .toString("base64")
        .replace(/=+$/, "")
        .replace(/\//g, "_")
        .replace(/\+/g, "-")}`;

      const item = await client
        .api(`/shares/${shareId}/driveItem`)
        .select("id,name,webUrl,folder,file,parentReference")
        .get();

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: item.id,
              name: item.name,
              type: item.folder ? "folder" : "file",
              webUrl: item.webUrl,
              driveId: item.parentReference?.driveId,
              siteId: item.parentReference?.siteId,
              parentFolderId: item.parentReference?.id,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to resolve URL to a drive item"
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
      if (!response.file) {
        return new Err(
          new MCPError(
            "The specified item is not a file (it may be a folder or other non-file resource)."
          )
        );
      }
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

      // Download the existing document (with authenticated fallback when pre-signed URL is unavailable).
      const buffer = await downloadDriveItemAsBuffer(
        client,
        endpoint,
        downloadUrl
      );

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
    { auth, authInfo, runContext }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    const allowedLabels = await getAllowedLabelsForMCPServer(auth, {
      runContext,
    });

    try {
      const endpoint = await getDriveItemEndpoint(itemId, driveId, siteId);

      const response = await client
        .api(endpoint)
        .select("sensitivityLabel,name,size,file,@microsoft.graph.downloadUrl")
        .get();

      if (allowedLabels.length > 0) {
        const labelId = response?.sensitivityLabel?.id;
        if (labelId && !allowedLabels.includes(labelId)) {
          return new Err(
            new MCPError(
              "Access denied: this file is not accessible with the current sensitivity label configuration."
            )
          );
        }
      }

      const downloadUrl = response["@microsoft.graph.downloadUrl"];
      if (!response.file) {
        return new Err(
          new MCPError(
            "The specified item is not a file (it may be a folder or other non-file resource)."
          )
        );
      }
      if (response.size && response.size > MAX_FILE_SIZE_BYTES) {
        return new Err(
          new MCPError(
            `File size exceeds the maximum limit of ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB.`,
            { tracked: false }
          )
        );
      }
      const mimeType = response.file.mimeType;
      const fileName = response.name;

      // For XML extraction (e.g. reading Word document XML before updating it),
      // use the specialized path with pagination support.
      if (getAsXml) {
        let content: string = "";
        try {
          content = await downloadAndProcessMicrosoftFile({
            downloadUrl,
            client,
            endpoint,
            mimeType,
            fileName,
            extractAsXml: true,
          });
        } catch (error) {
          return new Err(
            new MCPError(
              `Failed to process file: ${normalizeError(error).message}`
            )
          );
        }

        return new Ok([
          buildFileContentBlock({
            itemId,
            driveId,
            siteId,
            fileName,
            mimeType,
            content,
            offset,
            limit,
          }),
        ]);
      }

      if (
        !isTextReadableContentType(mimeType) &&
        response.size &&
        !isBinaryWithinFileOffloadLimit({ byteLength: response.size, mimeType })
      ) {
        return new Err(
          new MCPError(FILE_TOO_LARGE_TO_ATTACH_ERROR, { tracked: false })
        );
      }

      // Download the file as a buffer and attach it to the conversation.
      // Falls back to authenticated Graph API download when pre-signed URL is unavailable.
      let buffer: Buffer;
      try {
        buffer = await downloadDriveItemAsBuffer(client, endpoint, downloadUrl);
      } catch (err) {
        return new Err(
          new MCPError(
            `Failed to download file: ${normalizeError(err).message}`
          )
        );
      }

      const content = await readFileText({
        buffer,
        mimeType,
        workspaceId: auth.getNonNullableWorkspace().sId,
      });

      const blocks: CallToolResult["content"] = [];
      if (content !== null) {
        blocks.push(
          buildFileContentBlock({
            itemId,
            driveId,
            siteId,
            fileName,
            mimeType,
            content,
            offset,
            limit,
          })
        );
      }
      if (
        (content === null || offset === 0) &&
        isBinaryWithinFileOffloadLimit({ byteLength: buffer.length, mimeType })
      ) {
        blocks.push({
          type: "resource" as const,
          resource: {
            blob: buffer.toString("base64"),
            _meta: { text: `File: ${sanitizeFilename(fileName)}` },
            mimeType,
            uri: sanitizeFilename(fileName),
          },
        });
      }
      if (blocks.length === 0) {
        return new Err(
          new MCPError(FILE_TOO_LARGE_TO_ATTACH_ERROR, { tracked: false })
        );
      }

      return new Ok(blocks);
    } catch (err) {
      return new Err(
        new MCPError(
          normalizeError(err).message || "Failed to retrieve file content"
        )
      );
    }
  },

  create_folder: async (
    { name, driveId, siteId, parentFolderId },
    { authInfo }
  ) => {
    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      const endpoint = await getDriveItemEndpoint(undefined, driveId, siteId);
      const parentPath = parentFolderId
        ? `${endpoint}/items/${parentFolderId}`
        : `${endpoint}/root`;

      const createdFolder = await client.api(`${parentPath}/children`).post({
        name,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              id: createdFolder.id,
              name: createdFolder.name,
              webUrl: createdFolder.webUrl,
              parentFolderId: createdFolder.parentReference?.id,
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      const error = normalizeError(err);
      if (error.message.toLowerCase().includes("namealreadyexists")) {
        return new Err(
          new MCPError(
            `A folder named '${name}' already exists in this location. Use list_drive_items to get its id.`
          )
        );
      }
      return new Err(new MCPError(error.message || "Failed to create folder"));
    }
  },

  upload_file: async (
    { fileId, driveId, siteId, parentFolderId, fileName },
    { auth, authInfo, runContext }
  ) => {
    assert(isAgentLoopRunContext(runContext), "AgentLoopRunContext expected");

    const client = await getGraphClient(authInfo);
    if (!client) {
      return new Err(
        new MCPError("Failed to authenticate with Microsoft Graph")
      );
    }

    try {
      // Get the file from conversation attachment
      const fileResult = await getFileFromConversationAttachment(
        auth,
        fileId,
        runContext
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

      const uploadFileName = sanitizeFilename(fileName ?? filename);
      const encodedFileName = encodeURIComponent(uploadFileName);

      // Upload into the target folder by item id; addressing folders by
      // path is locale-dependent and lets Graph implicitly create folders
      // on misresolved paths.
      const uploadEndpoint = parentFolderId
        ? `${endpoint}/items/${parentFolderId}:/${encodedFileName}:/content`
        : `${endpoint}/root:/${encodedFileName}:/content`;

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

  rename_drive_item: async (
    { itemId, driveId, siteId, name },
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
      const response = await client.api(endpoint).patch({ name });

      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(
            {
              success: true,
              message: "Item renamed successfully",
              item: {
                id: response.id,
                name: response.name,
                webUrl: response.webUrl,
                lastModifiedDateTime: response.lastModifiedDateTime,
              },
            },
            null,
            2
          ),
        },
      ]);
    } catch (err) {
      return new Err(
        new MCPError(normalizeError(err).message || "Failed to rename item")
      );
    }
  },

  copy_file: async (
    { itemId, driveId, siteId, parentReference, name },
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

      const requestBody: {
        name: string;
        parentReference?: { id: string; driveId: string };
      } = { name };

      if (parentReference) {
        requestBody.parentReference = parentReference;
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
