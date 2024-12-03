import type { FileUseCase, PlainTextContentType, Result } from "@dust-tt/types";
import {
  assertNever,
  CoreAPI,
  Err,
  getSmallWhitelistedModel,
  isSupportedPlainTextContentType,
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
import logger from "@app/logger/logger";
import { generateRandomModelSId } from "@app/lib/resources/string_ids";

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

const notSupportedError: ProcessingFunction = async ({ file }) => {
  return new Err(
    new Error(
      "Processing not supported for " +
        `content type ${file.contentType} and use case ${file.useCase}`
    )
  );
};

async function generateSnippet(
  auth: Authenticator,
  file: FileResource,
  content: string
): Promise<Result<string, Error>> {
  const startTime = Date.now();
  const owner = auth.getNonNullableWorkspace();

  if (
    file.contentType === "text/csv" ||
    file.contentType === "text/comma-separated-values"
  ) {
    // Parse only the headers from the CSV file
    const headers = content.split("\n")[0];

    let snippet = `CSV file with headers: ${headers}`;
    if (snippet.length > 256) {
      snippet = snippet.slice(0, 242) + "... (truncated)";
    }

    return new Ok(snippet);
  } else {
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
          new Error(`Snippet generation is still running, should never happen.`)
        );
      default:
        assertNever(run);
    }
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

type ProcessingPerUseCase = {
  [k in FileUseCase]: ProcessingFunction | undefined;
};

type ProcessingPerContentType = {
  [k in PlainTextContentType]: ProcessingPerUseCase | undefined;
};

const processingPerContentType: ProcessingPerContentType = {
  "application/msword": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/pdf": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/comma-separated-values": {
    conversation: upsertTableToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: upsertTableToDatasource,
  },
  "text/csv": {
    conversation: upsertTableToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: upsertTableToDatasource,
  },
  "text/markdown": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/plain": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tab-separated-values": {
    conversation: upsertDocumentToDatasource, // Should it be upsertTableToDatasource?
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tsv": {
    conversation: upsertDocumentToDatasource, // Should it be upsertTableToDatasource?
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/vnd.dust.attachment.slack.thread": {
    conversation: upsertDocumentToDatasource,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
};

const maybeApplyProcessing: ProcessingFunction = async ({
  auth,
  content,
  file,
  dataSource,
}) => {
  const contentTypeProcessing =
    isSupportedPlainTextContentType(file.contentType) &&
    processingPerContentType[file.contentType];
  if (!contentTypeProcessing) {
    return new Ok(undefined);
  }

  const processing = contentTypeProcessing[file.useCase];
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
  const jitEnabled = await isJITActionsEnabled(auth);
  const isJitCompatibleUseCase =
    file.useCase === "conversation" || file.useCase === "tool_output";
  const hasJitRequiredMetadata =
    isJitCompatibleUseCase &&
    !!file.useCaseMetadata &&
    !!file.useCaseMetadata.conversationId;
  const isJitSupportedContentType = isSupportedPlainTextContentType(
    file.contentType
  );

  if (!jitEnabled || !isJitCompatibleUseCase || !isJitSupportedContentType) {
    return new Ok(file);
  }

  if (!hasJitRequiredMetadata) {
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
