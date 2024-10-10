import { buffer } from "node:stream/consumers";

import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import {
  Err,
  isTextExtractionSupportedContentType,
  Ok,
  pagePrefixesPerMimeType,
  TextExtraction,
} from "@dust-tt/types";
import { parse } from "csv-parse";
import sharp from "sharp";
import type { TransformCallback } from "stream";
import { PassThrough, Readable, Transform } from "stream";
import { pipeline } from "stream/promises";

import config from "@app/lib/api/config";
import type { CSVRow } from "@app/lib/api/csv";
import { analyzeCSVColumns } from "@app/lib/api/csv";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

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

    await pipeline(
      textStream,
      async function* (source) {
        for await (const chunk of source) {
          yield chunk;
        }
      },
      writeStream
    );

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
): Promise<Result<undefined, Error>> => {
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
    const processedPipeline = pipeline(
      readStream.pipe(new PassThrough()),
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

type PreprocessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

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

export async function maybeApplyPreProcessing(
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> {
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
    }
  }

  await file.markAsReady();

  return new Ok(undefined);
}
