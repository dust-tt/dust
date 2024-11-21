import {
  isTextExtractionSupportedContentType,
  pagePrefixesPerMimeType,
  TextExtraction,
} from "@dust-tt/types";
import { buffer } from "stream/consumers";

import config from "@app/lib/api/config";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

export const extractTextFromFile = async (
  auth: Authenticator,
  file: FileResource
): Promise<string> => {
  try {
    if (!isTextExtractionSupportedContentType(file.contentType)) {
      throw new Error("unsupported_content_type");
    }

    const readStream = file.getReadStream({
      auth,
      version: "original",
    });

    // Load file in memory.
    const arrayBuffer = await buffer(readStream);

    // Extract text from the file.
    const extractionRes = await new TextExtraction(
      config.getTextExtractionUrl()
    ).fromBuffer(arrayBuffer, file.contentType);

    if (extractionRes.isErr()) {
      // We must throw here, stream does not support Result type.
      throw extractionRes.error;
    }

    const pages = extractionRes.value;

    const prefix = pagePrefixesPerMimeType[file.contentType];

    let content: string = "";
    for (const page of pages) {
      const pageText = prefix
        ? `${prefix}: ${page.pageNumber}/${pages.length}\n${page.content}\n\n`
        : page.content;
      content += pageText;
    }

    return content;
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text from File."
    );

    throw err;
  }
};
