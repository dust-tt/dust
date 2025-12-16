import TurndownService from "turndown";

import {
  getGoogleDriveClient,
  SUPPORTED_MIMETYPES,
} from "@app/lib/providers/google_drive/utils";
import type {
  ToolDownloadParams,
  ToolDownloadResult,
  ToolSearchParams,
  ToolSearchRawResult,
} from "@app/lib/search/tools/types";
import type { ContentNodeType } from "@app/types/core/content_node";

import { PROVIDER_DOWNLOAD_MAX_FILE_SIZE } from "../constants";

const turndownService = new TurndownService({
  headingStyle: "atx",
  codeBlockStyle: "fenced",
  bulletListMarker: "-",
});

turndownService.remove(["style", "script", "meta", "link", "head"]);

// Remove images with base64 data URIs (they're huge and not useful in text form).
turndownService.addRule("removeBase64Images", {
  filter: (node) => {
    if (node.nodeName !== "IMG") {
      return false;
    }
    const src = node.getAttribute("src") ?? "";
    return src.startsWith("data:");
  },
  replacement: () => "",
});

export async function search({
  accessToken,
  query,
  pageSize,
}: ToolSearchParams): Promise<ToolSearchRawResult[]> {
  const drive = getGoogleDriveClient(accessToken);

  const searchQuery = `name contains '${query.replace(/'/g, "\\'")}' and trashed = false`;

  const res = await drive.files.list({
    q: searchQuery,
    pageSize: Math.min(pageSize, 100),
    fields: "files(id, name, mimeType, webViewLink)",
    includeItemsFromAllDrives: true,
    supportsAllDrives: true,
    corpora: "allDrives",
    orderBy: "modifiedTime desc",
  });

  return (res.data.files ?? []).map((file) => {
    const mimeType = file.mimeType ?? "application/octet-stream";
    let type: ContentNodeType = "document";
    if (mimeType === "application/vnd.google-apps.folder") {
      type = "folder";
    } else if (
      mimeType === "application/vnd.google-apps.spreadsheet" ||
      mimeType === "text/csv"
    ) {
      type = "table";
    }
    return {
      externalId: file.id ?? "",
      mimeType,
      title: file.name ?? "Untitled",
      type,
      sourceUrl: file.webViewLink ?? null,
    };
  });
}

export async function download({
  accessToken,
  externalId,
}: ToolDownloadParams): Promise<ToolDownloadResult> {
  const drive = getGoogleDriveClient(accessToken);

  const fileMetadata = await drive.files.get({
    fileId: externalId,
    supportsAllDrives: true,
    fields: "id, name, mimeType, size",
  });

  const file = fileMetadata.data;
  if (!file.mimeType || !file.name) {
    throw new Error("File metadata is incomplete.");
  }

  if (file.size && parseInt(file.size, 10) > PROVIDER_DOWNLOAD_MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${PROVIDER_DOWNLOAD_MAX_FILE_SIZE / (1024 * 1024)} MB.`
    );
  }

  let content: string;
  let contentType: "text/markdown" | "text/csv" | "text/plain";

  // Export Google native files or download regular files.
  if (
    file.mimeType === "application/vnd.google-apps.document" ||
    file.mimeType === "application/vnd.google-apps.presentation"
  ) {
    // Export as HTML and convert to markdown to preserve formatting (headings, lists, etc).
    const exportRes = await drive.files.export({
      fileId: externalId,
      mimeType: "text/html",
    });
    if (typeof exportRes.data !== "string") {
      throw new Error("Failed to export file content.");
    }
    content = turndownService.turndown(exportRes.data);
    contentType = "text/markdown";
  } else if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    // Export Google Sheets as CSV.
    const exportRes = await drive.files.export({
      fileId: externalId,
      mimeType: "text/csv",
    });
    if (typeof exportRes.data !== "string") {
      throw new Error("Failed to export spreadsheet content.");
    }
    content = exportRes.data;
    contentType = "text/csv";
  } else if (SUPPORTED_MIMETYPES.includes(file.mimeType)) {
    const downloadRes = await drive.files.get({
      fileId: externalId,
      alt: "media",
    });
    if (typeof downloadRes.data !== "string") {
      throw new Error("Failed to download file content.");
    }
    content = downloadRes.data;
    contentType = "text/plain";
  } else {
    throw new Error(`Unsupported file type: ${file.mimeType}`);
  }

  return {
    content,
    fileName: file.name,
    contentType,
  };
}
