import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  assertNever,
  CoreAPI,
  Err,
  getSmallWhitelistedModel,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
  Ok,
  removeNulls,
  slugify,
} from "@dust-tt/types";
import { Writable } from "stream";
import { pipeline } from "stream/promises";

import { runAction } from "@app/lib/actions/server";
import { isJITActionsEnabled } from "@app/lib/api/assistant/jit_actions";
import config from "@app/lib/api/config";
import {
  createDataSourceWithoutProvider,
  upsertDocument,
  upsertTable,
} from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { Conversation } from "@app/lib/models/assistant/conversation";
import { cloneBaseConfig, DustProdActionRegistry } from "@app/lib/registry";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";
import logger from "@app/logger/logger";

const ENABLE_LLM_SNIPPETS = false;

class MemoryWritable extends Writable {
  private chunks: string[];

  constructor() {
    super();
    this.chunks = [];
  }

  _write(
    chunk: any,
    encoding: BufferEncoding,
    callback: (error?: Error | null) => void
  ) {
    this.chunks.push(chunk.toString());
    callback();
  }

  getContent() {
    return this.chunks.join("");
  }
}

async function generateSnippet(
  auth: Authenticator,
  file: FileResource,
  content: string
): Promise<Result<string, Error>> {
  const startTime = Date.now();
  const owner = auth.getNonNullableWorkspace();

  if (isSupportedImageContentType(file.contentType)) {
    return new Err(
      new Error("Image files are not supported for file snippets.")
    );
  }

  if (isSupportedDelimitedTextContentType(file.contentType)) {
    // Parse only the headers from the CSV file
    const headers = content.split("\n")[0];

    let snippet = `${file.contentType} file with headers: ${headers}`;
    if (snippet.length > 256) {
      snippet = snippet.slice(0, 242) + "... (truncated)";
    }

    return new Ok(snippet);
  }

  switch (file.contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/plain":
    case "text/markdown":
    case "text/html":
    case "text/xml":
    case "text/calendar":
    case "text/css":
    case "text/javascript":
    case "application/json":
    case "application/xml":
    case "application/x-sh":
    case "text/vnd.dust.attachment.slack.thread":
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
        DustProdActionRegistry["conversation-file-summarizer"].config
      );
      appConfig.MODEL.provider_id = model.providerId;
      appConfig.MODEL.model_id = model.modelId;

      const coreAPI = new CoreAPI(config.getCoreAPIConfig(), logger);
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
            new Error(
              `Snippet generation is still running, should never happen.`
            )
          );
        default:
          assertNever(run);
      }
      break;

    default:
      assertNever(file.contentType);
  }
}

// Upload to dataSource
const upsertDocumentToDatasource: ProcessingFunction = async ({
  auth,
  file,
  content,
  dataSource,
}) => {
  // Use the file id as the document id to make it easy to track the document back to the file.
  const documentId = file.sId;
  const sourceUrl = file.getPrivateUrl(auth);

  const upsertDocumentRes = await upsertDocument({
    name: documentId,
    source_url: sourceUrl,
    text: content,
    parents: [documentId],
    tags: [`title:${file.fileName}`, `fileId:${file.sId}`],
    light_document_output: true,
    dataSource,
    auth,
    mime_type: file.contentType,
    title: file.fileName,
  });

  if (upsertDocumentRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "There was an error upserting the document.",
      data_source_error: upsertDocumentRes.error,
    });
  }

  return new Ok(undefined);
};

const upsertTableToDatasource: ProcessingFunction = async ({
  auth,
  file,
  content,
  dataSource,
}) => {
  const tableId = file.sId; // Use the file sId as the table id to make it easy to track the table back to the file.
  const upsertTableRes = await upsertTable({
    tableId,
    name: slugify(file.fileName),
    description: "Table uploaded from file",
    truncate: true,
    csv: content,
    tags: [`title:${file.fileName}`, `fileId:${file.sId}`],
    parents: [tableId],
    async: false,
    dataSource,
    auth,
    useAppForHeaderDetection: true,
    title: file.fileName,
    mimeType: file.contentType,
  });

  if (upsertTableRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "There was an error upserting the table.",
      data_source_error: upsertTableRes.error,
    });
  }

  return new Ok(undefined);
};

// Processing for datasource upserts.

type ProcessingFunction = ({
  auth,
  file,
  content,
  dataSource,
}: {
  auth: Authenticator;
  file: FileResource;
  content: string;
  dataSource: DataSourceResource;
}) => Promise<Result<undefined, Error>>;

const getProcessingFunction = ({
  contentType,
  useCase,
}: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): ProcessingFunction | undefined => {
  if (isSupportedImageContentType(contentType)) {
    return undefined;
  }

  // Use isSupportedDelimitedTextContentType() everywhere to have a common source of truth
  if (isSupportedDelimitedTextContentType(contentType)) {
    if (
      useCase === "conversation" ||
      useCase === "tool_output" ||
      useCase === "folder_table"
    ) {
      return upsertTableToDatasource;
    } else if (useCase === "folder_document") {
      return upsertDocumentToDatasource;
    } else {
      return undefined;
    }
  }

  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/pdf":
    case "text/markdown":
    case "text/plain":
    case "text/vnd.dust.attachment.slack.thread":
    case "text/html":
    case "text/xml":
    case "text/calendar":
    case "text/css":
    case "text/javascript":
    case "application/json":
    case "application/xml":
    case "application/x-sh":
      if (useCase === "conversation" || useCase === "tool_output") {
        return upsertDocumentToDatasource;
      }
      break;

    default:
      assertNever(contentType);
  }

  return undefined;
};

const isUpsertSupported = (arg: {
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): boolean => {
  const processing = getProcessingFunction(arg);
  return !!processing;
};

const maybeApplyProcessing: ProcessingFunction = async ({
  auth,
  content,
  file,
  dataSource,
}) => {
  const processing = getProcessingFunction(file);

  if (processing) {
    const startTime = Date.now();
    const res = await processing({ auth, file, content, dataSource });
    if (res.isErr()) {
      return res;
    } else {
      const endTime = Date.now();
      logger.info(
        {
          workspaceId: auth.workspace()?.sId,
          fileId: file.sId,
        },
        `Processing took ${endTime - startTime}ms`
      );
      return new Ok(undefined);
    }
  }

  return new Ok(undefined);
};

async function getFileContent(
  auth: Authenticator,
  file: FileResource
): Promise<string> {
  // Create a stream to hold the content of the file
  const writableStream = new MemoryWritable();

  // Read from the processed file
  await pipeline(
    file.getReadStream({ auth, version: "processed" }),
    writableStream
  );

  const content = writableStream.getContent();

  if (!content) {
    throw new Error("No content extracted from file for JIT processing.");
  }

  return content;
}

export async function processAndUpsertToDataSource(
  auth: Authenticator,
  { file, optionalContent }: { file: FileResource; optionalContent?: string }
): Promise<
  Result<
    FileResource,
    Omit<DustError, "code"> & {
      code:
        | "internal_server_error"
        | "invalid_request_error"
        | "file_too_large"
        | "file_type_not_supported";
    }
  >
> {
  const jitEnabled = isJITActionsEnabled();

  if (!jitEnabled || !isUpsertSupported(file)) {
    return new Ok(file);
  }

  // Note: this assume that if we don't have useCaseMetadata, the file is fine.
  const hasRequiredMetadata =
    !!file.useCaseMetadata && !!file.useCaseMetadata.conversationId;

  if (!hasRequiredMetadata) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File is missing required metadata for JIT processing.",
    });
  }

  if (file.status !== "ready") {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File is not ready for post processing.",
    });
  }

  const content = optionalContent
    ? optionalContent
    : await getFileContent(auth, file);

  if (!content) {
    logger.error(
      {
        fileId: file.sId,
        workspaceId: auth.workspace()?.sId,
        contentSupplied: !!optionalContent,
      },
      "No content extracted from file for JIT processing."
    );
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: "No content extracted from file for JIT processing.",
    });
  }

  const workspace = auth.getNonNullableWorkspace();

  const conversation = await Conversation.findOne({
    where: {
      sId: file.useCaseMetadata.conversationId,
      workspaceId: workspace.id,
    },
  });

  if (conversation === null) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to fetch conversation.`,
    });
  }

  // Fetch the datasource linked to the conversation...
  let dataSource = await DataSourceResource.fetchByConversationId(
    auth,
    conversation.id
  );

  if (!dataSource) {
    // ...or create a new one.
    const conversationsSpace =
      await SpaceResource.fetchWorkspaceConversationsSpace(auth);

    // IMPORTANT: never use the conversation sID in the name or description, as conversation sIDs
    // are used as secrets to share the conversation within the workspace users.
    const r = await createDataSourceWithoutProvider(auth, {
      plan: auth.getNonNullablePlan(),
      owner: auth.getNonNullableWorkspace(),
      space: conversationsSpace,
      name: generateRandomModelSId("conv"),
      description: "Files uploaded to conversation",
      conversationId: conversation.id,
    });

    if (r.isErr()) {
      return new Err({
        name: "dust_error",
        code: "internal_server_error",
        message: `Failed to create datasource : ${r.error}`,
      });
    }

    dataSource = r.value.dataSource;
  }

  const [processingRes, snippetRes] = await Promise.all([
    maybeApplyProcessing({
      auth,
      file,
      content,
      dataSource,
    }),
    generateSnippet(auth, file, content),
  ]);

  if (processingRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to process the file : ${processingRes.error}`,
    });
  }

  if (snippetRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to generate snippet: ${snippetRes.error}`,
    });
  }

  // If the snippet is present, it means the file is ready to use for JIT actions.
  await file.setSnippet(snippetRes.value);

  return new Ok(file);
}
