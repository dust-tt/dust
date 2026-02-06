// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isSupportedPlainTextContentType } from "@dust-tt/client";
import TurndownService from "turndown";

import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import config from "@app/lib/api/config";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { CoreAPI } from "@app/types/core/core_api";
import { isSupportedAudioContentType } from "@app/types/files";
import {
  isInteractiveContentFileContentType,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";

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
    const schemaRes = await coreAPI.tableValidateCSVContent({
      projectId: dataSource.dustAPIProjectId,
      dataSourceId: dataSource.dustAPIDataSourceId,
      bucket: file.getBucketForVersion("processed").name,
      bucketCSVPath: file.getCloudStoragePath(auth, "processed"),
    });

    if (schemaRes.isErr()) {
      return new Err(
        new Error(`Invalid CSV content: ${schemaRes.error.message}`)
      );
    }

    let snippet = `${file.contentType} file with headers: ${schemaRes.value.schema.map((c) => c.name).join(",")}`;
    if (snippet.length > 256) {
      snippet = snippet.slice(0, 242) + "... (truncated)";
    }

    return new Ok(snippet);
  }

  if (isSupportedPlainTextContentType(file.contentType)) {
    const content = await getFileContent(auth, file);
    if (!content) {
      return new Err(new Error("Failed to get file content"));
    }

    if (isPastedFile(file.contentType)) {
      // Include all the text content, as if they were pasted directly in the conversation.
      return new Ok(content);
    }

    // Take the first 256 characters
    if (content.length > 256) {
      return new Ok(content.slice(0, 242) + "... (truncated)");
    } else {
      return new Ok(content);
    }
  }

  if (isSupportedAudioContentType(file.contentType)) {
    const content = await getFileContent(auth, file, "processed");
    if (!content) {
      return new Err(new Error("Failed to get file processed content"));
    }

    let snippet = `Audio file: ${content}`;
    if (snippet.length > 256) {
      snippet = snippet.slice(0, 242) + "... (truncated)";
    }

    return new Ok(snippet);
  }

  if (isInteractiveContentFileContentType(file.contentType)) {
    const htmlContent = await getFileContent(auth, file, "original");
    if (!htmlContent) {
      return new Err(new Error("Failed to get file content"));
    }

    // Convert HTML to markdown for snippet
    const turndownService = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
    });
    const markdownContent = turndownService.turndown(htmlContent);

    // Take the first 256 characters
    if (markdownContent.length > 256) {
      return new Ok(markdownContent.slice(0, 242) + "... (truncated)");
    } else {
      return new Ok(markdownContent);
    }
  }

  return new Err(new Error("Unsupported file type"));
}
