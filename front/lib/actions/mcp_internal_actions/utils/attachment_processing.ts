import { MCPError } from "@app/lib/actions/mcp_errors";
import { sanitizeFilename } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  isTextExtractionSupportedContentType,
  TextExtraction,
} from "@app/types/shared/text_extraction";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Readable } from "stream";

/**
 * Extract text from a buffer using the text extraction service
 *
 * Supports OCR for scanned documents and various document formats (PDF, Word, Excel, etc.)
 *
 * @param buffer - The file content as a Buffer
 * @param mimeType - The MIME type of the file (e.g., "application/pdf")
 * @returns Result with extracted text or error message
 */
export async function extractTextFromBuffer(
  buffer: Buffer,
  mimeType: string
): Promise<Result<string, string>> {
  if (!isTextExtractionSupportedContentType(mimeType)) {
    return new Err(`Text extraction not supported for file type: ${mimeType}.`);
  }

  try {
    const textExtraction = new TextExtraction(config.getTextExtractionUrl(), {
      enableOcr: true,
      logger,
    });

    const bufferStream = Readable.from(buffer);
    const textStream = await textExtraction.fromStream(
      bufferStream,
      mimeType as Parameters<typeof textExtraction.fromStream>[1]
    );

    const chunks: string[] = [];
    for await (const chunk of textStream) {
      chunks.push(chunk.toString());
    }

    return new Ok(chunks.join(""));
  } catch (error) {
    return new Err(`Failed to extract text: ${normalizeError(error).message}`);
  }
}

export function isTextReadableContentType(mimeType: string): boolean {
  return (
    isTextExtractionSupportedContentType(mimeType) ||
    mimeType.startsWith("text/")
  );
}

/**
 * Returns the text of a file: extracted for supported document types, decoded as UTF-8 for
 * `text/*` types, `null` when the type has no readable text or extraction failed.
 */
export async function readFileText({
  buffer,
  mimeType,
  workspaceId,
}: {
  buffer: Buffer;
  mimeType: string;
  workspaceId: string;
}): Promise<string | null> {
  if (isTextExtractionSupportedContentType(mimeType)) {
    const textResult = await extractTextFromBuffer(buffer, mimeType);
    if (textResult.isOk()) {
      return textResult.value;
    }
    logger.warn(
      { workspaceId, mimeType, error: textResult.error },
      "Text extraction failed for file"
    );
  }
  if (mimeType.startsWith("text/")) {
    return buffer.toString("utf-8");
  }
  return null;
}

export function paginateText({
  text,
  offset,
  limit,
}: {
  text: string;
  offset: number;
  limit: number;
}) {
  const startIndex = Math.max(0, offset);
  const endIndex = Math.min(text.length, startIndex + Math.max(0, limit));
  const content = text.slice(startIndex, endIndex);
  const hasMore = endIndex < text.length;

  return {
    content,
    returnedContentLength: content.length,
    totalContentLength: text.length,
    offset: startIndex,
    nextOffset: hasMore ? endIndex : undefined,
    hasMore,
  };
}

/**
 * This function implements a three-step decision tree for handling file attachments:
 * 1. Try text extraction for supported document types (PDF, Word, Excel, etc.)
 * 2. Download the file and check if it's plain text
 * 3. Return binary files as resource blocks for upload
 *
 * @param mimeType - MIME type of the attachment (e.g., "application/pdf", "image/png")
 * @param filename - Name of the attachment file
 * @param extractText - Callback to extract text from the file *
 * @param downloadContent - Callback to download the file content
 */
export async function processAttachment({
  mimeType,
  filename,
  extractText,
  downloadContent,
}: {
  mimeType: string;
  filename: string;
  extractText: () => Promise<Result<string, string>>;
  downloadContent: () => Promise<Result<Buffer, string>>;
}): Promise<Result<CallToolResult["content"], MCPError>> {
  // Try text extraction for supported file types
  if (isTextExtractionSupportedContentType(mimeType)) {
    const textResult = await extractText();

    if (textResult.isOk()) {
      return new Ok([
        {
          type: "text" as const,
          text: JSON.stringify(textResult.value, null, 2),
        },
      ]);
    }

    logger.warn(
      `Text extraction failed for ${filename}, falling back to file attachment`,
      { error: textResult.error }
    );
  }

  const downloadResult = await downloadContent();

  if (downloadResult.isErr()) {
    return new Err(
      new MCPError(`Failed to download attachment: ${downloadResult.error}`)
    );
  }

  const buffer = downloadResult.value;

  // Return plain text content as text
  if (mimeType.startsWith("text/")) {
    return new Ok([
      {
        type: "text" as const,
        text: JSON.stringify(buffer.toString("utf-8"), null, 2),
      },
    ]);
  }

  // Return binary files as resource for upload
  return new Ok([
    {
      type: "resource" as const,
      resource: {
        blob: buffer.toString("base64"),
        _meta: { text: `Attachment: ${sanitizeFilename(filename)}` },
        mimeType,
        uri: sanitizeFilename(filename),
      },
    },
  ]);
}
