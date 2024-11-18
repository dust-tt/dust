import { buffer } from "node:stream/consumers";

import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  guessDelimiter,
  isSupportedPlainTextContentType,
  isTextExtractionSupportedContentType,
  Ok,
  pagePrefixesPerMimeType,
  TextExtraction,
} from "@dust-tt/types";
import { parse } from "csv-parse";
import { IncomingForm } from "formidable";
import type { IncomingMessage } from "http";
import sharp from "sharp";
import type { TransformCallback } from "stream";
import { PassThrough, Readable, Transform } from "stream";
import { pipeline } from "stream/promises";
import { v4 as uuidv4 } from "uuid";

import { isJITActionsEnabled } from "@app/lib/api/assistant/jit_actions";
import config from "@app/lib/api/config";
import type { CSVRow } from "@app/lib/api/csv";
import { analyzeCSVColumns } from "@app/lib/api/csv";
import {
  createDataSourceWithoutProvider,
  upsertDocument,
  upsertTable,
} from "@app/lib/api/data_sources";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { DataSourceResource } from "@app/lib/resources/data_source_resource";
import type { FileResource } from "@app/lib/resources/file_resource";
import { SpaceResource } from "@app/lib/resources/space_resource";
import logger from "@app/logger/logger";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.

async function isValidTableFile(
  file: FileResource,
  content: string
): Promise<boolean> {
  // Check file type
  const isCSV =
    file.contentType === "text/csv" ||
    file.contentType === "text/comma-separated-values";
  const isTSV =
    file.contentType === "text/tsv" ||
    file.contentType === "text/tab-separated-values";

  if (!isCSV && !isTSV) {
    // Check extension as fallback
    const ext = file.fileName.split(".").pop()?.toLowerCase();
    if (ext !== "csv" && ext !== "tsv" && ext !== "xlsx" && ext !== "xls") {
      return false;
    }
  }

  // Check file size
  const MAX_SIZE = 30 * 1024 * 1024; // 30MB
  if (file.fileSize > MAX_SIZE) {
    return false;
  }

  // For CSV/TSV, validate structure
  if (isCSV || isTSV) {
    try {
      const delimiter = await guessDelimiter(content);
      return !!delimiter; // Valid if we can detect a consistent delimiter
    } catch {
      return false;
    }
  }

  return true;
}

// NotSupported preprocessing

const notSupportedError: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  return new Err(
    new Error(
      "Pre-processing not supported for " +
        `content type ${file.contentType} and use case ${file.useCase}`
    )
  );
};

// Upload to public bucket.

const uploadToPublicBucket: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });
  const writeStream = file.getWriteStream({
    auth,
    version: "public",
  });
  try {
    await pipeline(readStream, writeStream);
    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to upload file to public url."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(
      new Error(`Failed uploading to public bucket. ${errorMessage}`)
    );
  }
};

// Images preprocessing.

const resizeAndUploadToFileStorage: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });

  // Resize the image, preserving the aspect ratio. Longest side is max 768px.
  const resizedImageStream = sharp().resize(768, 768, {
    fit: sharp.fit.inside, // Ensure longest side is 768px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 768px.
  });

  const writeStream = file.getWriteStream({
    auth,
    version: "processed",
  });

  try {
    await pipeline(readStream, resizedImageStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to resize image."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(new Error(`Failed resizing image. ${errorMessage}`));
  }
};

async function createFileTextStream(buffer: Buffer, contentType: string) {
  if (!isTextExtractionSupportedContentType(contentType)) {
    throw new Error("unsupported_content_type");
  }

  const extractionRes = await new TextExtraction(
    config.getTextExtractionUrl()
  ).fromBuffer(buffer, contentType);

  if (extractionRes.isErr()) {
    // We must throw here, stream does not support Result type.
    throw extractionRes.error;
  }

  const pages = extractionRes.value;

  const prefix = pagePrefixesPerMimeType[contentType];

  return new Readable({
    async read() {
      for (const page of pages) {
        const pageText = prefix
          ? `${prefix}: ${page.pageNumber}/${pages.length}\n${page.content}\n\n`
          : page.content;
        this.push(pageText);
      }
      this.push(null);
    },
  });
}

const extractTextFromFile: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });
    // Load file in memory.
    const arrayBuffer = await buffer(readStream);

    const writeStream = file.getWriteStream({
      auth,
      version: "processed",
    });
    const textStream = await createFileTextStream(
      arrayBuffer,
      file.contentType
    );

    let content: string = "";
    await pipeline(
      textStream,
      async function* (source) {
        for await (const chunk of source) {
          content += chunk;
          yield chunk;
        }
      },
      writeStream
    );

    return new Ok(content);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text from File."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(
      new Error(`Failed extracting text from File. ${errorMessage}`)
    );
  }
};

// CSV preprocessing.
// We upload the content of the CSV on the processed bucket and the schema in the snippet bucket.
class CSVColumnAnalyzerTransform extends Transform {
  private rows: CSVRow[] = [];

  constructor(options = {}) {
    super({ ...options, objectMode: true });
  }
  _transform(chunk: CSVRow, encoding: string, callback: TransformCallback) {
    this.rows.push(chunk);
    callback();
  }
  _flush(callback: TransformCallback) {
    this.push(JSON.stringify(analyzeCSVColumns(this.rows), null, 2));
    callback();
  }
}

const extractContentAndSchemaFromCSV: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });
    const processedWriteStream = file.getWriteStream({
      auth,
      version: "processed",
    });
    const schemaWriteStream = file.getWriteStream({
      auth,
      version: "snippet",
      overrideContentType: "application/json",
    });

    // Process the first stream for processed file
    let content: string = "";
    const processedPipeline = pipeline(
      readStream.pipe(new PassThrough()),
      async function* (source) {
        for await (const chunk of source) {
          content += chunk;
          yield chunk;
        }
      },
      processedWriteStream
    );

    // Process the second stream for snippet file
    const snippetPipeline = pipeline(
      readStream.pipe(new PassThrough()),
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
      new CSVColumnAnalyzerTransform(),
      schemaWriteStream
    );
    // Wait for both pipelines to finish
    await Promise.all([processedPipeline, snippetPipeline]);

    return new Ok(content);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text or snippet from CSV."
    );
    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";
    return new Err(new Error(`Failed extracting from CSV. ${errorMessage}`));
  }
};

// Other text files preprocessing.

// We don't apply any processing to these files, we just store the raw text.
const storeRawText: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });
  const writeStream = file.getWriteStream({
    auth,
    version: "processed",
  });

  let content: string = "";
  try {
    await pipeline(
      readStream,
      async function* (source) {
        for await (const chunk of source) {
          content += chunk;
          yield chunk;
        }
      },
      writeStream
    );

    return new Ok(content);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to store raw text."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(new Error(`Failed to store raw text ${errorMessage}`));
  }
};

// Preprocessing for file upload.

type PreprocessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<string | undefined, Error>>;

type PreprocessingPerUseCase = {
  [k in FileUseCase]: PreprocessingFunction | undefined;
};

type PreprocessingPerContentType = {
  [k in SupportedFileContentType]: PreprocessingPerUseCase | undefined;
};

const processingPerContentType: PreprocessingPerContentType = {
  "application/msword": {
    conversation: extractTextFromFile,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    conversation: extractTextFromFile,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/pdf": {
    conversation: extractTextFromFile,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "image/jpeg": {
    conversation: resizeAndUploadToFileStorage,
    avatar: uploadToPublicBucket,
    tool_output: notSupportedError,
  },
  "image/png": {
    conversation: resizeAndUploadToFileStorage,
    avatar: uploadToPublicBucket,
    tool_output: notSupportedError,
  },
  "text/comma-separated-values": {
    conversation: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/csv": {
    conversation: extractContentAndSchemaFromCSV,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/markdown": {
    conversation: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/plain": {
    conversation: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tab-separated-values": {
    conversation: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tsv": {
    conversation: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
};

const maybeApplyPreProcessing: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const contentTypeProcessing = processingPerContentType[file.contentType];
  if (!contentTypeProcessing) {
    await file.markAsReady();

    return new Ok(undefined);
  }

  const processing = contentTypeProcessing[file.useCase];
  if (processing) {
    const res = await processing(auth, file);
    if (res.isErr()) {
      await file.markAsFailed();

      return res;
    } else {
      await file.markAsReady();

      return new Ok(res.value);
    }
  }

  await file.markAsReady();

  return new Ok(undefined);
};

export async function uploadToCloudStorage(
  auth: Authenticator,
  { file, req }: { file: FileResource; req: IncomingMessage }
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
  if (file.isReady || file.isFailed) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "The file has already been uploaded or the upload has failed.",
    });
  }

  if (file.createdAt.getTime() + UPLOAD_DELAY_AFTER_CREATION_MS < Date.now()) {
    await file.markAsFailed();
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "File upload has expired. Create a new file.",
    });
  }

  try {
    const form = new IncomingForm({
      // Stream the uploaded document to the cloud storage.
      fileWriteStreamHandler: () => {
        return file.getWriteStream({
          auth,
          version: "original",
        });
      },

      // Support only one file upload.
      maxFiles: 1,

      // Validate the file size.
      maxFileSize: file.fileSize,

      // Ensure the file is of the correct type.
      filter: function (part) {
        if (part.mimetype !== file.contentType) {
          return false;
        }

        return true;
      },
    });
    const [, files] = await form.parse(req);

    const maybeFiles = files.file;

    if (!maybeFiles || maybeFiles.length === 0) {
      return new Err({
        name: "dust_error",
        code: "file_type_not_supported",
        message: "No file uploaded.",
      });
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.startsWith("options.maxTotalFileSize")) {
        return new Err({
          name: "dust_error",
          code: "file_too_large",
          message: "File is too large.",
        });
      }
    }

    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Error uploading file : ${error instanceof Error ? error : new Error(JSON.stringify(error))}`,
    });
  }

  const preProcessingRes = await maybeApplyPreProcessing(auth, file);
  if (preProcessingRes.isErr()) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to process the file : ${preProcessingRes.error}`,
    });
  }

  // Upsert to the conversation datasource & generate a snippet.
  // TODO(JIT) the tool output flow do not go through this path.
  const jitEnabled = await isJITActionsEnabled(auth);
  if (
    jitEnabled &&
    (file.useCase === "conversation" || file.useCase === "tool_output") &&
    isSupportedPlainTextContentType(file.contentType)
  ) {
    const content = preProcessingRes.value;

    if (!content) {
      logger.warn(
        {
          fileId: file.id,
          workspaceId: auth.workspace()?.sId,
          contentType: file.contentType,
          useCase: file.useCase,
        },
        "No content extracted from file for JIT processing, should not happen. Action: check that the processing function returns the content."
      );
    } else {
      // Upsert the file to the conversation datasource.
      const conversationsSpace =
        await SpaceResource.fetchWorkspaceConversationsSpace(auth);

      // TODO(JIT) we need to retrieve the conversation linked to the file somehow.
      const conversationId = 345;

      // Fetch the datasource linked to the conversation...
      let dataSource = await DataSourceResource.fetchByConversationId(
        auth,
        conversationId
      );

      if (!dataSource) {
        // ...or create a new one.

        // IMPORTANT: never use the conversation sID in the name or description, as conversation sIDs are used as secrets to share the conversation within the workspace users.
        const name = `Conversation ${uuidv4()}`;
        const r = await createDataSourceWithoutProvider(auth, {
          plan: auth.getNonNullablePlan(),
          owner: auth.getNonNullableWorkspace(),
          space: conversationsSpace,
          name: name,
          description: "Files uploaded to conversation",
          conversationId,
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

      const documentId = `${file.id}`; // Use the file id as the document id to make it easy to track the document back to the file.
      const sourceUrl = file.getPublicUrl(auth);

      // TODO(JIT) note, upsertDocument do not call runPostUpsertHooks (seems used for document tracker)
      const upsertDocumentRes = await upsertDocument({
        name: documentId,
        source_url: sourceUrl,
        text: content,
        parents: [documentId],
        tags: [`title:${file.fileName}`],
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

      const isTable = await isValidTableFile(file, "fake csv");

      if (isTable) {
        const tableId = `${file.id}`; // Use the file id as the table id to make it easy to track the table back to the file.
        const upsertTableRes = await upsertTable({
          tableId,
          name: file.fileName,
          description: "Table uploaded from file",
          truncate: true,
          csv: content,
          tags: [`title:${file.fileName}`],
          parents: [tableId],
          async: false,
          dataSource,
          auth,
          useAppForHeaderDetection: true,
        });

        if (upsertTableRes.isErr()) {
          return new Err({
            name: "dust_error",
            code: "internal_server_error",
            message: "There was an error upserting the table.",
            data_source_error: upsertTableRes.error,
          });
        }
      }
    }
  }

  return new Ok(file);
}
