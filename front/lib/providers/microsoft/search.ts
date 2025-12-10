import { Client as GraphClient } from "@microsoft/microsoft-graph-client";

import {
  downloadAndProcessMicrosoftFile,
  searchMicrosoftDriveItems,
} from "@app/lib/actions/mcp_internal_actions/servers/microsoft/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import logger from "@app/logger/logger";
import type { ContentNodeType } from "@app/types/core/content_node";

const MAX_FILE_SIZE = 64 * 1024 * 1024; // 64 MB

// Supported MIME types for Microsoft files
const SUPPORTED_MIMETYPES = [
  // Word
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  // Excel
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  // PowerPoint
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  // PDF
  "application/pdf",
  // Text
  "text/plain",
  "text/markdown",
];

function getMimeTypeCategory(mimeType: string): ContentNodeType {
  // Excel files → "table"
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "table";
  }

  // All other supported types → "document"
  return "document";
}

function getContentTypeForMimeType(
  mimeType: string
): "text/markdown" | "text/csv" | "text/plain" {
  // Excel files → CSV
  if (
    mimeType ===
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mimeType === "application/vnd.ms-excel"
  ) {
    return "text/csv";
  }

  // Plain text files
  if (mimeType === "text/plain" || mimeType === "text/markdown") {
    return "text/plain";
  }

  // All other supported types (Word, PowerPoint, PDF) → Markdown
  return "text/markdown";
}

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const client = GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });

  try {
    // Use shared search function
    const response = await searchMicrosoftDriveItems({
      client,
      query: "FileName: " + query,
      pageSize: Math.min(pageSize, 100),
    });

    // Parse response structure
    if (
      !response?.value?.[0]?.hitsContainers?.[0]?.hits ||
      !Array.isArray(response.value[0].hitsContainers[0].hits)
    ) {
      return [];
    }

    const hits = response.value[0].hitsContainers[0].hits;

    return hits
      .map((hit: any) => {
        const resource = hit.resource;
        if (!resource || !resource.id || !resource.name) {
          return null;
        }

        // Get driveId from parentReference (essential for download)
        const driveId = resource.parentReference?.driveId;
        if (!driveId) {
          // Skip items without driveId as we can't download them
          return null;
        }

        // Determine if it's a folder
        const isFolder = !!resource.folder;

        // Get mimeType
        const mimeType = isFolder
          ? "folder"
          : (resource.file?.mimeType ?? "application/octet-stream");

        // Determine type
        let type: ContentNodeType = "document";
        if (isFolder) {
          type = "folder";
        } else {
          type = getMimeTypeCategory(mimeType);
        }

        // Store both driveId and itemId in externalId (format: driveId:itemId)
        return {
          externalId: `${driveId}:${resource.id}`,
          title: resource.name,
          mimeType,
          type,
          sourceUrl: resource.webUrl ?? null,
        };
      })
      .filter(
        (result: ToolSearchRawResult | null): result is ToolSearchRawResult =>
          result !== null
      );
  } catch (error) {
    logger.error(
      {
        error,
        query,
      },
      "Error searching Microsoft Drive files"
    );
    return [];
  }
}

export async function download({
  accessToken,
  externalId,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const client = GraphClient.init({
    authProvider: (done) => done(null, accessToken),
  });

  // Parse externalId (format: driveId:itemId)
  const parts = externalId.split(":");
  if (parts.length !== 2) {
    throw new Error(`Invalid externalId format: ${externalId}`);
  }
  const [driveId, itemId] = parts;

  // Get file metadata using the universal /drives/{driveId}/items/{itemId} endpoint
  // Same pattern as get_file_content MCP tool - don't use .select() to ensure @microsoft.graph.downloadUrl is included
  const fileMetadata = await client
    .api(`/drives/${driveId}/items/${itemId}`)
    .get();

  if (!fileMetadata.name) {
    throw new Error("File metadata is incomplete.");
  }

  const mimeType = fileMetadata.file?.mimeType;
  if (!mimeType) {
    throw new Error("File MIME type is missing.");
  }

  // Check if file type is supported
  if (!SUPPORTED_MIMETYPES.includes(mimeType)) {
    throw new Error(
      `Unsupported file type: ${mimeType}. Supported types: ${SUPPORTED_MIMETYPES.join(", ")}`
    );
  }

  // Check file size
  if (fileMetadata.size && fileMetadata.size > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB.`
    );
  }

  const downloadUrl = fileMetadata["@microsoft.graph.downloadUrl"];
  if (!downloadUrl) {
    throw new Error("Download URL is not available for this file.");
  }

  // Use the shared download and processing logic from utils.ts (same as get_file_content MCP tool)
  const content = await downloadAndProcessMicrosoftFile({
    downloadUrl,
    mimeType,
    fileName: fileMetadata.name,
  });

  const contentType = getContentTypeForMimeType(mimeType);

  return {
    content,
    fileName: fileMetadata.name,
    contentType,
  };
}
