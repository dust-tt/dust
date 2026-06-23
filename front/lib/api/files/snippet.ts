import { FILE_OFFLOAD_TEXT_SIZE_BYTES } from "@app/lib/actions/action_output_limits";
import config from "@app/lib/api/config";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { isPastedFile } from "@app/lib/files";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import {
  isSupportedAudioContentType,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { isSupportedPlainTextContentType } from "@dust-tt/client";

export const TRUNCATED_SUFFIX = "... (truncated)";
export const TRUNCATED_SNIPPET_SIZE = 256;
export const TRUNCATED_TEXT_SIZE =
  TRUNCATED_SNIPPET_SIZE - TRUNCATED_SUFFIX.length;

// Pasted content is inlined in full in the rendered conversation only while it stays below the
// same threshold used to offload large tool outputs to files. Beyond that, only a truncated
// snippet is inlined and the model reads the full content through the conversation file tools.
// For ASCII-dominant text, 1 char ≈ 1 byte, so we use FILE_OFFLOAD_TEXT_SIZE_BYTES directly as
// a character count to keep everything here in a single unit.
export function isPastedContentOverInlineLimit(content: string): boolean {
  return content.length > FILE_OFFLOAD_TEXT_SIZE_BYTES;
}

export function truncateSnippet(content: string): string {
  return content.slice(0, TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX;
}

// Snippets of pasted content stored before the inline limit was lowered may contain the full
// paste (up to 128KB). Re-truncate them so consumers never inline an oversized paste.
export function truncateLegacyPastedSnippet<
  T extends { contentType: string; snippet: string | null },
>(attachment: T): T {
  if (
    isPastedFile(attachment.contentType) &&
    attachment.snippet !== null &&
    isPastedContentOverInlineLimit(attachment.snippet)
  ) {
    return { ...attachment, snippet: truncateSnippet(attachment.snippet) };
  }
  return attachment;
}

export async function generateSnippet(
  auth: Authenticator,
  {
    file,
    dataSource,
  }: {
    file: FileResource;
    dataSource?: DataSourceResource;
  }
): Promise<Result<string, Error>> {
  if (isSupportedImageContentType(file.contentType)) {
    return new Err(
      new Error("Image files are not supported for file snippets.")
    );
  }

  if (isSupportedDelimitedTextContentType(file.contentType)) {
    if (!dataSource) {
      return new Err(
        new Error(
          "Data source is required to generate a delimited text snippet."
        )
      );
    }

    const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
    const { bucket, path } = file.getContentBucketAndPath(auth);
    const schemaRes = await coreAPI.tableValidateCSVContent({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      bucket,
      bucketCSVPath: path,
    });

    if (schemaRes.isErr()) {
      return new Err(
        new Error(`Invalid CSV content: ${schemaRes.error.message}`)
      );
    }

    let snippet = `${file.contentType} file with headers: ${schemaRes.value.schema.map((c) => c.name).join(",")}`;
    if (snippet.length > TRUNCATED_SNIPPET_SIZE) {
      snippet = truncateSnippet(snippet);
    }

    return new Ok(snippet);
  }

  if (isSupportedPlainTextContentType(file.contentType)) {
    const content = await getFileContent(auth, file);
    if (!content) {
      return new Err(new Error("Failed to get file content"));
    }

    if (isPastedFile(file.contentType)) {
      // Include the full pasted text up to the tool-output offload threshold. Beyond that,
      // truncate to 256 characters like a regular text file to avoid blowing up the conversation
      // context. We really want to avoid having a snippet which is both large and truncated,
      // otherwise the model will pay the cost of the large snippet + read the file.
      if (isPastedContentOverInlineLimit(content)) {
        return new Ok(truncateSnippet(content));
      }
      return new Ok(content);
    }

    // Take the first 256 characters
    if (content.length > TRUNCATED_SNIPPET_SIZE) {
      return new Ok(truncateSnippet(content));
    } else {
      return new Ok(content);
    }
  }

  if (isSupportedAudioContentType(file.contentType)) {
    const content = await getFileContent(auth, file);
    if (!content) {
      return new Err(new Error("Failed to get file processed content"));
    }

    let snippet = `Audio file: ${content}`;
    if (snippet.length > TRUNCATED_SNIPPET_SIZE) {
      snippet = truncateSnippet(snippet);
    }

    return new Ok(snippet);
  }

  return new Err(new Error("Unsupported file type"));
}
