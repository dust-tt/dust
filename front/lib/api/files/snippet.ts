import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import config from "@app/lib/api/config";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
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

export const PASTED_CONTENT_MAX_CHARACTERS = 128 * 1024;
export const TRUNCATED_SUFFIX = "... (truncated)";
export const TRUNCATED_SNIPPET_SIZE = 256;
export const TRUNCATED_TEXT_SIZE =
  TRUNCATED_SNIPPET_SIZE - TRUNCATED_SUFFIX.length;

export async function generateSnippet(
  auth: Authenticator,
  {
    file,
    dataSource,
  }: {
    file: FileResource;
    dataSource: DataSourceResource;
  }
): Promise<Result<string, Error>> {
  const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);

  if (isSupportedImageContentType(file.contentType)) {
    return new Err(
      new Error("Image files are not supported for file snippets.")
    );
  }

  if (isSupportedDelimitedTextContentType(file.contentType)) {
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
      snippet = snippet.slice(0, TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX;
    }

    return new Ok(snippet);
  }

  if (isSupportedPlainTextContentType(file.contentType)) {
    const content = await getFileContent(auth, file);
    if (!content) {
      return new Err(new Error("Failed to get file content"));
    }

    if (isPastedFile(file.contentType)) {
      // Include the full pasted text up to 128K characters. Beyond that, truncate to 256
      // characters like a regular text file to avoid blowing up the conversation context.
      // We really want to avoid having a snippet which is both large and truncated,
      // otherwise the model will pay the cost of the large snippet + read the file.
      if (content.length > PASTED_CONTENT_MAX_CHARACTERS) {
        return new Ok(content.slice(0, TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX);
      }
      return new Ok(content);
    }

    // Take the first 256 characters
    if (content.length > TRUNCATED_SNIPPET_SIZE) {
      return new Ok(content.slice(0, TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX);
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
      snippet = snippet.slice(0, TRUNCATED_TEXT_SIZE) + TRUNCATED_SUFFIX;
    }

    return new Ok(snippet);
  }

  return new Err(new Error("Unsupported file type"));
}
