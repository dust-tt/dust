import { google } from "googleapis";

import type { ContentNodeType } from "@app/types";

import type {
  SearchableProvider,
  ToolAttachment,
  ToolSearchRawNode,
} from "./types";

const SUPPORTED_MIMETYPES = [
  "application/vnd.google-apps.document",
  "application/vnd.google-apps.presentation",
  "application/vnd.google-apps.spreadsheet",
  "text/plain",
  "text/markdown",
  "text/csv",
  "application/pdf",
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB.

function getClient(accessToken: string) {
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.drive({ version: "v3", auth: oauth2Client });
}

async function search({
  accessToken,
  query,
  pageSize,
}: {
  accessToken: string;
  query: string;
  pageSize: number;
}): Promise<ToolSearchRawNode[]> {
  const drive = getClient(accessToken);

  const searchQuery = `(name contains '${query.replace(/'/g, "\\'")}' or fullText contains '${query.replace(/'/g, "\\'")}') and trashed = false`;

  const res = await drive.files.list({
    q: searchQuery,
    pageSize: Math.min(pageSize, 100),
    fields: "files(id, name, mimeType)",
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
      internalId: file.id ?? "",
      mimeType,
      title: file.name ?? "Untitled",
      type,
    };
  });
}

async function getFile({
  accessToken,
  fileId,
}: {
  accessToken: string;
  fileId: string;
}): Promise<ToolAttachment> {
  const drive = getClient(accessToken);

  const fileMetadata = await drive.files.get({
    fileId,
    supportsAllDrives: true,
    fields: "id, name, mimeType, size",
  });
  const file = fileMetadata.data;

  if (!file.mimeType || !SUPPORTED_MIMETYPES.includes(file.mimeType)) {
    throw new Error(
      `Unsupported file type: ${file.mimeType}. Supported types: ${SUPPORTED_MIMETYPES.join(", ")}`
    );
  }

  if (file.size && parseInt(file.size, 10) > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB for attachments.`
    );
  }

  let fileName = file.name ?? "untitled";
  let content: Buffer;
  let mimeType: string;

  switch (file.mimeType) {
    case "application/vnd.google-apps.document":
    case "application/vnd.google-apps.presentation": {
      const res = await drive.files.export(
        { fileId, mimeType: "text/plain" },
        { responseType: "text" }
      );
      content = Buffer.from(res.data as string, "utf-8");
      mimeType = "text/plain";
      if (!fileName.endsWith(".txt")) {
        fileName = `${fileName}.txt`;
      }
      break;
    }
    case "application/vnd.google-apps.spreadsheet": {
      const res = await drive.files.export(
        { fileId, mimeType: "text/csv" },
        { responseType: "text" }
      );
      content = Buffer.from(res.data as string, "utf-8");
      mimeType = "text/csv";
      if (!fileName.endsWith(".csv")) {
        fileName = `${fileName}.csv`;
      }
      break;
    }
    case "application/pdf": {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "arraybuffer" }
      );
      content = Buffer.from(res.data as ArrayBuffer);
      mimeType = "application/pdf";
      break;
    }
    case "text/plain":
    case "text/markdown":
    case "text/csv": {
      const res = await drive.files.get(
        { fileId, alt: "media" },
        { responseType: "text" }
      );
      content = Buffer.from(res.data as string, "utf-8");
      mimeType = file.mimeType;
      break;
    }
    default:
      throw new Error(`Unsupported file type: ${file.mimeType}`);
  }

  if (content.length > MAX_FILE_SIZE) {
    throw new Error(
      `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)} MB for attachments.`
    );
  }

  return {
    fileName,
    mimeType,
    contentBase64: content.toString("base64"),
  };
}

export const googleDriveProvider: SearchableProvider = {
  search,
  getFile,
};
