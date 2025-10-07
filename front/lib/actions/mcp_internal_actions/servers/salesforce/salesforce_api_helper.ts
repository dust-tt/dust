import type { Connection } from "jsforce";

import type { Result } from "@app/types";
import { Err, normalizeError, Ok } from "@app/types";

import { extractTextFromBuffer } from "../../utils/attachment_processing";

const SF_API_VERSION = "57.0";

function isValidSalesforceId(id: string): boolean {
  if (!id || typeof id !== "string") {
    return false;
  }

  // Salesforce IDs are 15-18 alphanumeric characters
  const salesforceIdPattern = /^[a-zA-Z0-9]{15,18}$/;
  return salesforceIdPattern.test(id);
}

export interface AttachmentMetadata {
  id: string;
  filename: string;
  mimeType: string;
  size?: number;
  created?: string;
  author?: string;
}

interface SalesforceAttachment {
  Id: string;
  Name: string;
  ContentType: string;
  BodyLength: number;
  CreatedDate: string;
  CreatedBy?: { Name?: string };
}

async function getSalesforceAttachments(
  conn: Connection,
  parentId: string
): Promise<Result<AttachmentMetadata[], string>> {
  try {
    // Validate input to prevent SQL injection
    if (!isValidSalesforceId(parentId)) {
      return new Err("Invalid Salesforce ID format");
    }

    const result = await conn.query<SalesforceAttachment>(`
      SELECT Id, Name, ContentType, BodyLength, CreatedDate, CreatedBy.Name
      FROM Attachment
      WHERE ParentId = '${parentId}'
      ORDER BY CreatedDate DESC
    `);

    const attachments: AttachmentMetadata[] = result.records.map((record) => {
      const filename = record.Name || `attachment-${record.Id}`;
      return {
        id: record.Id,
        filename,
        mimeType: record.ContentType || "application/octet-stream",
        size: record.BodyLength,
        created: record.CreatedDate,
        author: record.CreatedBy?.Name,
      };
    });

    return new Ok(attachments);
  } catch (error) {
    return new Err(
      `Failed to get attachments: ${normalizeError(error).message}`
    );
  }
}

interface ContentDocumentLink {
  ContentDocumentId: string;
}

interface ContentVersion {
  Id: string;
  Title: string;
  FileType: string;
  ContentSize: number;
  CreatedDate: string;
  CreatedBy?: { Name?: string };
}

async function getSalesforceFiles(
  conn: Connection,
  parentId: string
): Promise<Result<AttachmentMetadata[], string>> {
  try {
    const linkResult = await conn.query<ContentDocumentLink>(`
      SELECT ContentDocumentId
      FROM ContentDocumentLink
      WHERE LinkedEntityId = '${parentId}'
    `);

    if (linkResult.records.length === 0) {
      return new Ok([]);
    }

    const contentDocumentIds = linkResult.records.map(
      (record) => record.ContentDocumentId
    );

    const fileResult = await conn.query<ContentVersion>(`
      SELECT Id, Title, FileType, ContentSize, CreatedDate, CreatedBy.Name
      FROM ContentVersion
      WHERE ContentDocumentId IN ('${contentDocumentIds.join("','")}')
      AND IsLatest = true
      ORDER BY CreatedDate DESC
    `);

    const files: AttachmentMetadata[] = fileResult.records.map((record) => {
      const filename = record.Title || `file-${record.Id}`;
      return {
        id: record.Id,
        filename,
        mimeType: getMimeType(record.FileType),
        size: record.ContentSize,
        created: record.CreatedDate,
        author: record.CreatedBy?.Name,
      };
    });

    return new Ok(files);
  } catch (error) {
    return new Err(`Failed to get files: ${normalizeError(error).message}`);
  }
}

async function downloadSalesforceAttachment(
  conn: Connection,
  attachmentId: string
): Promise<Result<Buffer, string>> {
  try {
    const url = `${conn.instanceUrl}/services/data/v${SF_API_VERSION}/sobjects/Attachment/${attachmentId}/Body`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      return new Err(`Salesforce API error: ${response.status}`);
    }

    return new Ok(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return new Err(
      `Failed to download attachment: ${normalizeError(error).message}`
    );
  }
}

async function downloadSalesforceFile(
  conn: Connection,
  contentVersionId: string
): Promise<Result<Buffer, string>> {
  try {
    const url = `${conn.instanceUrl}/services/data/v${SF_API_VERSION}/sobjects/ContentVersion/${contentVersionId}/VersionData`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${conn.accessToken}`,
        Accept: "*/*",
      },
    });

    if (!response.ok) {
      return new Err(`Salesforce API error: ${response.status}`);
    }

    return new Ok(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    return new Err(`Failed to download file: ${normalizeError(error).message}`);
  }
}

export async function getAllSalesforceAttachments(
  conn: Connection,
  recordId: string
): Promise<Result<AttachmentMetadata[], string>> {
  if (!isValidSalesforceId(recordId)) {
    return new Err("Invalid Salesforce ID format");
  }

  const [attachmentsResult, filesResult] = await Promise.all([
    getSalesforceAttachments(conn, recordId),
    getSalesforceFiles(conn, recordId),
  ]);

  if (attachmentsResult.isErr()) {
    return attachmentsResult;
  }

  if (filesResult.isErr()) {
    return filesResult;
  }

  return new Ok([...attachmentsResult.value, ...filesResult.value]);
}

export async function downloadSalesforceContent(
  conn: Connection,
  attachmentId: string
): Promise<Result<Buffer, string>> {
  if (!isValidSalesforceId(attachmentId)) {
    return new Err("Invalid Salesforce ID format");
  }

  // Salesforce ID prefixes:
  // "068" = ContentVersion (modern files)
  // "00P" = Attachment (legacy attachments)
  const isFile = attachmentId.startsWith("068");

  if (isFile) {
    return downloadSalesforceFile(conn, attachmentId);
  } else {
    return downloadSalesforceAttachment(conn, attachmentId);
  }
}

export async function extractTextFromSalesforceAttachment(
  conn: Connection,
  attachmentId: string,
  mimeType: string
): Promise<Result<string, string>> {
  if (!isValidSalesforceId(attachmentId)) {
    return new Err("Invalid Salesforce ID format");
  }

  const downloadResult = await downloadSalesforceContent(conn, attachmentId);

  if (downloadResult.isErr()) {
    return downloadResult;
  }

  return extractTextFromBuffer(downloadResult.value, mimeType);
}

function getMimeType(fileType: string): string {
  const type = fileType?.toUpperCase();

  if (type === "TEXT") {
    return "text/plain";
  }
  if (type === "PDF") {
    return "application/pdf";
  }
  if (type === "PNG") {
    return "image/png";
  }
  if (type === "JPG" || type === "JPEG") {
    return "image/jpeg";
  }
  if (type === "GIF") {
    return "image/gif";
  }

  // Everything else - will be handled as binary attachment
  return "application/octet-stream";
}
