import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { Readable } from "stream";

import {
  makeMCPToolJSONSuccess,
  makeMCPToolTextError,
} from "@app/lib/actions/mcp_internal_actions/utils";
import { sanitizeFilename } from "@app/lib/actions/mcp_internal_actions/utils/file_utils";
import config from "@app/lib/api/config";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import {
  Err,
  isTextExtractionSupportedContentType,
  normalizeError,
  Ok,
} from "@app/types";
import { TextExtraction } from "@app/types/shared/text_extraction";

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

/**
 * This function implements a three-step decision tree for handling file attachments:
 * 1. Try text extraction for supported document types (PDF, Word, Excel, etc.)
 * 2. Download the file and check if it's plain text
 * 3. Return binary files as resource blocks for upload
 *
 * @param mimeType - MIME type of the attachment (e.g., "application/pdf", "image/png")
 * @param filename - Name of the attachment file
 * @param params.extractText - Callback to extract text from the file *
 * @param params.downloadContent - Callback to download the file content
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
}): Promise<CallToolResult> {
  // Try text extraction for supported file types
  if (isTextExtractionSupportedContentType(mimeType)) {
    const textResult = await extractText();

    if (textResult.isOk()) {
      return makeMCPToolJSONSuccess({ result: textResult.value });
    }

    logger.warn(
      `Text extraction failed for ${filename}, falling back to file attachment`,
      { error: textResult.error }
    );
  }

  const downloadResult = await downloadContent();

  if (downloadResult.isErr()) {
    return makeMCPToolTextError(
      `Failed to download attachment: ${downloadResult.error}`
    );
  }

  const buffer = downloadResult.value;

  // Return plain text content as text
  if (mimeType.startsWith("text/")) {
    return makeMCPToolJSONSuccess({ result: buffer.toString("utf-8") });
  }

  // Return binary files as resource for upload
  return {
    isError: false,
    content: [
      {
        type: "resource" as const,
        resource: {
          blob: buffer.toString("base64"),
          text: `Attachment: ${sanitizeFilename(filename)}`,
          mimeType,
          uri: "",
        },
      },
    ],
  };
}
