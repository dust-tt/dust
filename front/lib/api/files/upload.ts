import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import { parse } from "csv-parse";
import type { IncomingMessage } from "http";
import sharp from "sharp";
import type { TransformCallback } from "stream";
import { PassThrough, Transform } from "stream";
import { pipeline } from "stream/promises";

import type { CSVRow } from "@app/lib/api/csv";
import { analyzeCSVColumns } from "@app/lib/api/csv";
import { extractTextFromFile } from "@app/lib/api/files/text_extraction";
import { parseUploadRequest } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.

const notSupportedError: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  return new Err(
    new Error(
      "Processing not supported for " +
        `content type ${file.contentType} and use case ${file.useCase}`
    )
  );
};

// Upload to public bucket.

const uploadToPublicBucket: ProcessingFunction = async (
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

// Images processing.

const resizeAndUploadToFileStorage: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });

  // Anthropic https://docs.anthropic.com/en/docs/build-with-claude/vision#evaluate-image-size
  // OpenAI https://platform.openai.com/docs/guides/vision#calculating-costs

  // Anthropic recommends <= 1568px on any side.
  // OpenAI recommends <= 2048px on the longuest side, 768px on the shortest side.

  // Resize the image, preserving the aspect ratio based on the longest side compatible with both models.
  // In case of GPT, it might incure a resize on their side as well but doing the math here would mean downloading the file first instead of streaming it.
  const resizedImageStream = sharp().resize(1568, 1568, {
    fit: sharp.fit.inside, // Ensure longest side is 1568px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 1568px.
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

const extractTextFromFileAndUpload: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    const content = await extractTextFromFile(auth, file);
    const writeStream = file.getWriteStream({ auth, version: "processed" });

    // Use pipeline with an async generator
    await pipeline(async function* () {
      yield content;
    }, writeStream);

    return new Ok(undefined);
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

// CSV processing.
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

const extractContentAndSchemaFromCSV: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  try {
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });

    // Process the first stream for processed file
    const processedPipeline = pipeline(
      readStream.pipe(new PassThrough()),
      file.getWriteStream({
        auth,
        version: "processed",
      })
    );

    // Process the second stream for snippet file
    const snippetPipeline = pipeline(
      readStream.pipe(new PassThrough()),
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
      }),
      new CSVColumnAnalyzerTransform(),
      file.getWriteStream({
        auth,
        version: "snippet",
        overrideContentType: "application/json",
      })
    );
    // Wait for both pipelines to finish
    await Promise.all([processedPipeline, snippetPipeline]);

    return new Ok(undefined);
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

// Other text files processing.

// We don't apply any processing to these files, we just store the raw text.
const storeRawText: ProcessingFunction = async (
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
      "Failed to store raw text."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";

    return new Err(new Error(`Failed to store raw text ${errorMessage}`));
  }
};

// Preprocessing for file upload.

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

type ProcessingPerUseCase = {
  [k in FileUseCase]: ProcessingFunction | undefined;
};

type ProcessingPerContentType = {
  [k in SupportedFileContentType]: ProcessingPerUseCase | undefined;
};

const processingPerContentType: ProcessingPerContentType = {
  "application/msword": {
    conversation: extractTextFromFileAndUpload,
    folder_document: extractTextFromFileAndUpload,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    folder_document: extractTextFromFileAndUpload,
    folder_table: notSupportedError,
    conversation: extractTextFromFileAndUpload,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "application/pdf": {
    folder_document: extractTextFromFileAndUpload,
    folder_table: notSupportedError,
    conversation: extractTextFromFileAndUpload,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "image/jpeg": {
    conversation: resizeAndUploadToFileStorage,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: uploadToPublicBucket,
    tool_output: notSupportedError,
  },
  "image/png": {
    conversation: resizeAndUploadToFileStorage,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: uploadToPublicBucket,
    tool_output: notSupportedError,
  },
  "text/comma-separated-values": {
    conversation: extractContentAndSchemaFromCSV,
    folder_document: storeRawText,
    folder_table: extractContentAndSchemaFromCSV,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/csv": {
    conversation: extractContentAndSchemaFromCSV,
    folder_document: storeRawText,
    folder_table: extractContentAndSchemaFromCSV,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/markdown": {
    conversation: storeRawText,
    folder_document: storeRawText,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/plain": {
    conversation: storeRawText,
    folder_document: storeRawText,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tab-separated-values": {
    conversation: storeRawText,
    folder_document: storeRawText,
    folder_table: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/tsv": {
    conversation: storeRawText,
    folder_document: storeRawText,
    folder_table: storeRawText,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
  "text/vnd.dust.attachment.slack.thread": {
    conversation: storeRawText,
    folder_document: notSupportedError,
    folder_table: notSupportedError,
    avatar: notSupportedError,
    tool_output: notSupportedError,
  },
};

const maybeApplyProcessing: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const contentTypeProcessing = processingPerContentType[file.contentType];
  if (!contentTypeProcessing) {
    return new Ok(undefined);
  }

  const processing = contentTypeProcessing[file.useCase];
  if (processing) {
    const res = await processing(auth, file);
    if (res.isErr()) {
      return res;
    } else {
      return new Ok(undefined);
    }
  }

  return new Ok(undefined);
};

export async function processAndStoreFile(
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

  const r = await parseUploadRequest(
    file,
    req,
    file.getWriteStream({ auth, version: "original" })
  );
  if (r.isErr()) {
    await file.markAsFailed();
    return r;
  }

  const processingRes = await maybeApplyProcessing(auth, file);
  if (processingRes.isErr()) {
    await file.markAsFailed();
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to process the file : ${processingRes.error}`,
    });
  }

  await file.markAsReady();
  return new Ok(file);
}
