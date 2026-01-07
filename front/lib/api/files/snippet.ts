// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isSupportedPlainTextContentType } from "@dust-tt/client";

import { isPastedFile } from "@app/components/assistant/conversation/input_bar/pasted_utils";
import type { AgentActionSpecification } from "@app/lib/actions/types/agent";
import { runMultiActionsAgent } from "@app/lib/api/assistant/call_llm";
import config from "@app/lib/api/config";
import { getFileContent } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { isSupportedAudioContentType } from "@app/types";
import {
  CoreAPI,
  Err,
  getSmallWhitelistedModel,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
  Ok,
} from "@app/types";

const ENABLE_LLM_SNIPPETS = false;

const SET_SNIPPET_FUNCTION_NAME = "set_snippet";

const specifications: AgentActionSpecification[] = [
  {
    name: SET_SNIPPET_FUNCTION_NAME,
    description: "Set the generated snippet for the file",
    inputSchema: {
      type: "object",
      properties: {
        snippet: {
          type: "string",
          description:
            "A concise summary of the file content (max 256 characters)",
        },
      },
      required: ["snippet"],
    },
  },
];

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
      // Include all the text content, as if they were pasted directly in the conversation.
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
        new Error(`Failed to find a whitelisted model to generate snippet`)
      );
    }

    const resTokenize = await coreAPI.tokenize({
      text: content,
      providerId: model.providerId,
      modelId: model.modelId,
      tokenizer: model.tokenizer,
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

    const res = await runMultiActionsAgent(
      auth,
      {
        modelId: model.modelId,
        providerId: model.providerId,
        temperature: 0,
        useCache: false,
      },
      {
        conversation: {
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: content }],
              name: "",
            },
          ],
        },
        prompt: `Generate a concise snippet (max 256 characters) that describes the content of the file provided by the user. Focus on what the file contains or does. Call the \`set_snippet\` function with your summary.`,
        specifications,
      },
      {
        context: {
          operationType: "file_snippet_generator",
          userId: auth.user()?.sId,
          workspaceId: owner.sId,
        },
      }
    );

    if (res.isErr()) {
      return new Err(
        new Error(`Error generating snippet: ${res.error.message}`)
      );
    }

    let snippet: string | null = null;

    if (res.value.actions) {
      for (const action of res.value.actions) {
        if (action.name === SET_SNIPPET_FUNCTION_NAME) {
          snippet = action.arguments.snippet;
        }
      }
    }

    if (!snippet) {
      return new Err(new Error("No snippet generated"));
    }

    if (snippet.length > 256) {
      snippet = snippet.slice(0, 242) + "... (truncated)";
    }

    const endTime = Date.now();
    logger.info(
      {
        workspaceId: owner.sId,
        fileId: file.sId,
      },
      `Snippet generation took ${endTime - startTime}ms`
    );

    return new Ok(snippet);
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
