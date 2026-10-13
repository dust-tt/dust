import {
  isBinaryWithinFileOffloadLimit,
  TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES,
} from "@app/lib/actions/action_output_limits";
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

const FILE_TOO_LARGE_TO_ATTACH_ERROR =
  "File is too large to be attached to the conversation and has no readable text content.";

export type BinaryFileResourceBlock = {
  type: "resource";
  resource: {
    blob: string;
    _meta: { text: string };
    mimeType: string;
    uri: string;
  };
};

/**
 * Builds a resource block for a binary file so downstream tools (sandbox upload, file viewer,
 * etc.) can consume the raw bytes alongside any extracted text.
 */
export function buildBinaryFileResource({
  buffer,
  fileName,
  mimeType,
}: {
  buffer: Buffer;
  fileName: string | null | undefined;
  mimeType: string;
}): BinaryFileResourceBlock {
  const safeFileName = sanitizeFilename(fileName ?? "unknown");
  return {
    type: "resource",
    resource: {
      blob: buffer.toString("base64"),
      _meta: { text: `File: ${safeFileName}` },
      mimeType,
      uri: safeFileName,
    },
  };
}

function isTextReadableContentType(mimeType: string): boolean {
  return (
    isTextExtractionSupportedContentType(mimeType) ||
    mimeType.startsWith("text/")
  );
}

/**
 * @cc [owner:tdraier,label:mcp;performance] rejects-unreturnable-files
 * MUST fail when `byteLength` exceeds `TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES`, or when the content type
 * has no readable text and a binary of `byteLength` bytes does not fit the file offload limit.
 */
export function checkFileSizeBeforeDownload({
  byteLength,
  mimeType,
}: {
  byteLength: number;
  mimeType: string;
}): Result<void, MCPError> {
  if (byteLength > TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES) {
    return new Err(
      new MCPError(
        `File size exceeds the maximum limit of ${TOOL_FILE_DOWNLOAD_MAX_SIZE_BYTES / (1024 * 1024)} MB.`,
        { tracked: false }
      )
    );
  }
  if (
    !isTextReadableContentType(mimeType) &&
    !isBinaryWithinFileOffloadLimit({ byteLength, mimeType })
  ) {
    return new Err(
      new MCPError(FILE_TOO_LARGE_TO_ATTACH_ERROR, { tracked: false })
    );
  }
  return new Ok(undefined);
}

type PaginatedText = {
  content: string;
  returnedContentLength: number;
  totalContentLength: number;
  offset: number;
  nextOffset: number | undefined;
  hasMore: boolean;
};

export function paginateText({
  text,
  offset,
  limit,
}: {
  text: string;
  offset: number;
  limit: number;
}): PaginatedText {
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

export function buildPaginatedTextBlock({
  metadata,
  text,
  offset,
  limit,
}: {
  metadata: Record<string, unknown>;
  text: string;
  offset: number;
  limit: number;
}): { type: "text"; text: string } {
  return {
    type: "text",
    text: JSON.stringify(
      { ...metadata, ...paginateText({ text, offset, limit }) },
      null,
      2
    ),
  };
}

/**
 * Returns the text of a file: extracted for supported document types, decoded as UTF-8 for
 * `text/*` types, `null` when the type has no readable text.
 */
async function readFileText({
  buffer,
  mimeType,
}: {
  buffer: Buffer;
  mimeType: string;
}): Promise<Result<string | null, string>> {
  if (isTextExtractionSupportedContentType(mimeType)) {
    return extractTextFromBuffer(buffer, mimeType);
  }
  if (mimeType.startsWith("text/")) {
    return new Ok(buffer.toString("utf-8"));
  }
  return new Ok(null);
}

/**
 * @cc [owner:tdraier,label:mcp;performance] text-paginated
 * The returned text block MUST hold at most `limit` characters of the file text, starting at
 * `offset`, along with `metadata`.
 */
/**
 * @cc [owner:tdraier,label:mcp;performance] binary-attached-once-within-offload-limit
 * The binary resource block MUST only be returned when it fits the file offload limit and, for
 * files with readable text, when `offset` is 0. MUST fail when neither block can be returned.
 */
export async function buildFileContentBlocks({
  buffer,
  fileName,
  mimeType,
  metadata,
  offset,
  limit,
  workspaceId,
}: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  metadata: Record<string, unknown>;
  offset: number;
  limit: number;
  workspaceId: string;
}): Promise<Result<CallToolResult["content"], MCPError>> {
  const textResult = await readFileText({ buffer, mimeType });
  if (textResult.isErr()) {
    logger.warn(
      { workspaceId, mimeType, error: textResult.error },
      "Text extraction failed for file"
    );
  }
  const text = textResult.isOk() ? textResult.value : null;

  const blocks: CallToolResult["content"] = [];
  if (text !== null) {
    blocks.push(buildPaginatedTextBlock({ metadata, text, offset, limit }));
  }
  if (
    (text === null || offset === 0) &&
    isBinaryWithinFileOffloadLimit({ byteLength: buffer.length, mimeType })
  ) {
    blocks.push(buildBinaryFileResource({ buffer, fileName, mimeType }));
  }

  if (blocks.length > 0) {
    return new Ok(blocks);
  }
  if (textResult.isErr()) {
    return new Err(
      new MCPError(
        `${textResult.error}. The file is too large to be attached to the conversation instead.`
      )
    );
  }
  return new Err(
    new MCPError(FILE_TOO_LARGE_TO_ATTACH_ERROR, { tracked: false })
  );
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
