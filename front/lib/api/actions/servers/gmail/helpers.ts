import { escape } from "html-escaper";

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailMessageBody {
  data?: string;
  size?: number;
  attachmentId?: string;
}

export interface AttachmentMetadata {
  attachmentId: string;
  partId: string;
  filename: string;
  mimeType: string;
  size: number;
  // True if attachmentId is a real Gmail attachment ID (can be fetched via API)
  // False if attachmentId is actually a partId (inline content, data in message body)
  hasRealAttachmentId: boolean;
}

export interface GmailMessagePart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessagePayload {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailMessageBody;
  parts?: GmailMessagePart[];
}

export interface GmailMessage {
  id: string;
  threadId?: string;
  labelIds?: string[];
  snippet?: string;
  payload?: GmailMessagePayload;
  sizeEstimate?: number;
  historyId?: string;
  internalDate?: string;
}

export interface MessageDetail {
  success: boolean;
  data?: GmailMessage;
  messageId?: string;
  error?: string;
}

export const MESSAGES_MAX_RESULTS = 50;
export const MESSAGES_WITH_ATTACHMENTS_MAX_RESULTS = 10;

/**
 * Typeguard for GmailMessage
 */
export function isGmailMessage(data: unknown): data is GmailMessage {
  if (typeof data !== "object" || data === null) {
    return false;
  }
  const obj = data as Record<string, unknown>;
  return typeof obj.id === "string";
}

/**
 * Decode the message body from base64 (recursive for multi-part messages)
 */
export function decodeMessageBody(
  payload: GmailMessagePayload | undefined
): string {
  if (!payload) {
    return "";
  }

  if (payload.mimeType === "text/plain" && payload.body?.data) {
    const base64 = payload.body.data.replace(/-/g, "+").replace(/_/g, "/");
    return Buffer.from(base64, "base64").toString("utf-8");
  }

  if (payload.parts) {
    for (const part of payload.parts) {
      const found = decodeMessageBody(part);
      if (found) {
        return found;
      }
    }
  }

  return "";
}

/**
 * Recursively extract attachment metadata from message payload
 */
export function extractAttachments(
  payload: GmailMessagePayload | undefined
): AttachmentMetadata[] {
  if (!payload) {
    return [];
  }

  const attachments: AttachmentMetadata[] = [];

  const traverse = (part: GmailMessagePart): void => {
    if (part.filename && part.filename.length > 0) {
      const hasRealAttachmentId = Boolean(part.body?.attachmentId);
      attachments.push({
        // Use the real attachmentId if available, otherwise use partId
        attachmentId: part.body?.attachmentId ?? part.partId ?? "",
        partId: part.partId ?? "",
        filename: part.filename,
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
        hasRealAttachmentId,
      });
    }
    if (part.parts) {
      for (const nested of part.parts) {
        traverse(nested);
      }
    }
  };

  traverse(payload);
  return attachments;
}

/**
 * Search payload for specific attachment data by partId
 */
export function findAttachmentData(
  payload: GmailMessagePayload | undefined,
  partId: string
): string | null {
  if (!payload) {
    return null;
  }

  const traverse = (part: GmailMessagePart): string | null => {
    // Match by partId to find inline attachment data
    if (part.partId === partId && part.body?.data) {
      return part.body.data;
    }
    if (part.parts) {
      for (const nested of part.parts) {
        const found = traverse(nested);
        if (found) {
          return found;
        }
      }
    }
    return null;
  };

  return traverse(payload);
}

/**
 * Create HTML quote section for replies with original message
 */
export function createQuoteSection(
  originalBody: string,
  originalDate: string | undefined,
  originalFrom: string | undefined
): string {
  if (!originalBody) {
    return "";
  }

  const separator =
    originalDate && originalFrom
      ? `On ${escape(originalDate)}, ${escape(originalFrom)} wrote:`
      : // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        `${escape(originalFrom || "Original sender")} wrote:`;

  const quotedOriginal = `<blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px #ccc solid;padding-left:1ex">${escape(originalBody).replace(/\n/g, "<br>")}</blockquote>`;

  return `<br><br><div class="gmail_quote">${separator}<br>${quotedOriginal}</div>`;
}

/**
 * Construct full reply body with user content and original quote
 */
export function buildReplyBody(
  userBody: string,
  contentType: "text/plain" | "text/html",
  originalBody: string,
  originalDate: string | undefined,
  originalFrom: string | undefined
): string {
  const quoteSection = createQuoteSection(
    originalBody,
    originalDate,
    originalFrom
  );

  if (contentType === "text/html") {
    // HTML content - use as-is
    return `<div dir="ltr">${userBody.trim()}${quoteSection}</div>`;
  } else {
    // Plain text content - convert to HTML with escaping
    const escapedBody = escape(userBody.trim()).replace(/\n/g, "<br>");
    return `<div dir="ltr"><div>${escapedBody}</div>${quoteSection}</div>`;
  }
}

/**
 * Extract specific header from message
 */
export function getHeaderValue(
  headers: GmailHeader[],
  name: string
): string | undefined {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())
    ?.value;
}

/**
 * Create In-Reply-To and References headers for threading
 */
export function createThreadingHeaders(
  originalMessageId: string | undefined,
  originalReferences: string | undefined
): string[] {
  const headers: string[] = [];

  if (originalMessageId) {
    headers.push(`In-Reply-To: ${originalMessageId}`);

    if (originalReferences) {
      headers.push(`References: ${originalReferences}`);
    } else {
      headers.push(`References: ${originalMessageId}`);
    }
  }

  return headers;
}

/**
 * Wrapper for fetch to Gmail API with Bearer token auth
 */
export async function fetchFromGmail(
  endpoint: string,
  accessToken: string,
  options?: RequestInit
): Promise<Response> {
  // eslint-disable-next-line no-restricted-globals
  return fetch(`https://gmail.googleapis.com${endpoint}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...options?.headers,
    },
  });
}

/**
 * Extract error text from response
 */
export async function getErrorText(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return "Unknown error";
  }
}

/**
 * Encode subject line using RFC 2047 to handle special characters
 */
export function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, "utf-8").toString("base64")}?=`;
}

/**
 * Encode message in base64 as required by the Gmail API
 */
export function encodeMessageForGmail(message: string): string {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}
