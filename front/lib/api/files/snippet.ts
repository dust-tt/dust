// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isSupportedPlainTextContentType } from "@dust-tt/client";

import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import { runAction } from "@app/lib/actions/server";
import config from "@app/lib/api/config";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { cloneBaseConfig, getDustProdAction } from "@app/lib/registry";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { isSupportedAudioContentType } from "@app/types";
import {
  assertNever,
  CoreAPI,
  Err,
  getSmallWhitelistedModel,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
  Ok,
  removeNulls,
} from "@app/types";

const ENABLE_LLM_SNIPPETS = false;

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
  const startTime = Date.now();
  const owner = auth.getNonNullableWorkspace();
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
    let content = await getFileContent(auth, file);
    if (!content) {
      return new Err(new Error("Failed to get file content"));
    }

    if (isPastedFile(file.contentType)) {
      // Include up to 2^16 characters in pasted text snippet
      if (content.length > 65536) {
        return new Ok(content.slice(0, 65536) + "... (truncated)");
      }
      return new Ok(content);
    }

    if (!ENABLE_LLM_SNIPPETS) {
      // Take the first 256 characters
      if (content.length > 256) {
        return new Ok(content.slice(0, 242) + "... (truncated)");
      } else {
        return new Ok(content);
      }
    }

    const model = getSmallWhitelistedModel(owner);
    if (!model) {
      return new Err(
        new Error(`Failed to find a whitelisted model to generate title`)
      );
    }

    const appConfig = cloneBaseConfig(
      getDustProdAction("conversation-file-summarizer").config
    );
    appConfig.MODEL.provider_id = model.providerId;
    appConfig.MODEL.model_id = model.modelId;

    const resTokenize = await coreAPI.tokenize({
      text: content,
      providerId: model.providerId,
      modelId: model.modelId,
    });

    if (resTokenize.isErr()) {
      return new Err(
        new Error(
          `Error tokenizing content: ${resTokenize.error.code} ${resTokenize.error.message}`
        )
      );
    }

    const tokensCount = resTokenize.value.tokens.length;
    const allowedTokens = model.contextSize * 0.9;
    if (tokensCount > allowedTokens) {
      // Truncate the content to the context size * 0.9 using cross product
      const truncateLength = Math.floor(
        (allowedTokens * content.length) / tokensCount
      );

      logger.warn(
        {
          tokensCount,
          contentLength: content.length,
          contextSize: model.contextSize,
        },
        `Truncating content to ${truncateLength} characters`
      );

      content = content.slice(0, truncateLength);
    }

    const res = await runAction(
      auth,
      "conversation-file-summarizer",
      appConfig,
      [
        {
          content: content,
        },
      ]
    );

    if (res.isErr()) {
      return new Err(
        new Error(
          `Error generating snippet: ${res.error.type} ${res.error.message}`
        )
      );
    }

    const {
      status: { run },
      traces,
      results,
    } = res.value;

    switch (run) {
      case "errored":
        const error = removeNulls(traces.map((t) => t[1][0][0].error)).join(
          ", "
        );
        return new Err(new Error(`Error generating snippet: ${error}`));
      case "succeeded":
        if (!results || results.length === 0) {
          return new Err(
            new Error(
              `Error generating snippet: no results returned while run was successful`
            )
          );
        }
        const snippet = results[0][0].value as string;
        const endTime = Date.now();
        logger.info(
          {
            workspaceId: owner.sId,
            fileId: file.sId,
          },
          `Snippet generation took ${endTime - startTime}ms`
        );

        return new Ok(snippet);
      case "running":
        return new Err(
          new Error(`Snippet generation is still running, should never happen.`)
        );
      default:
        assertNever(run);
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

  return new Err(new Error("Unsupported file type"));
}
