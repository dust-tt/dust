import config from "@app/lib/api/config";
import { parseUploadRequest } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import type { DustError } from "@app/lib/error";
import type { FileResource } from "@app/lib/resources/file_resource";
import { transcribeFile } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import type {
  AllSupportedFileContentType,
  FileUseCase,
  SupportedFileContentType,
} from "@app/types/files";
import {
  extensionsForContentType,
  isInteractiveContentFileContentType,
  isSupportedAudioContentType,
  isSupportedDelimitedTextContentType,
  isSupportedImageContentType,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  isTextExtractionSupportedContentType,
  TextExtraction,
} from "@app/types/shared/text_extraction";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
// biome-ignore lint/plugin/enforceClientTypesInPublicApi: existing usage
import { isDustMimeType } from "@dust-tt/client";
import ConvertAPI from "convertapi";
import fs from "fs";
import type { IncomingMessage } from "http";
import imageSize from "image-size";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileSync } from "tmp";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.
const PROCESSING_TIMEOUT_MS = 1000 * 10; // 10 seconds.
const CONVERSATION_IMG_MAX_SIZE_PIXELS = "1538";
const AVATAR_IMG_MAX_SIZE_PIXELS = "256";

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

// Images processing functions.
const resizeAndUploadToPublicBucket: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const result = await makeResizeAndUploadImageToFileStorage(
    AVATAR_IMG_MAX_SIZE_PIXELS
  )(auth, file);
  if (result.isErr()) {
    return result;
  }
  const readStream = file.getReadStream({
    auth,
    version: "processed",
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

const createReadableFromUrl = async (url: string): Promise<Readable> => {
  const response = await untrustedFetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch from URL: ${response.statusText}`);
  }
  return Readable.fromWeb(response.body);
};

const makeResizeAndUploadImageToFileStorage = (maxSize: string) => {
  return async (auth: Authenticator, file: FileResource) =>
    resizeAndUploadToFileStorage(auth, file, {
      ImageHeight: maxSize,
      ImageWidth: maxSize,
    });
};

interface ImageResizeParams {
  ImageHeight: string;
  ImageWidth: string;
}

const resizeAndUploadToFileStorage = async (
  auth: Authenticator,
  file: FileResource,
  resizeParams: ImageResizeParams
) => {
  const maxSizePixels = parseInt(resizeParams.ImageWidth);

  // Check image dimensions before calling ConvertAPI
  try {
    const readStreamForProbe = file.getReadStream({
      auth,
      version: "original",
    });

    // Read first 32KB (sufficient for all image format headers)
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxBufferSize = 32 * 1024;

    for await (const chunk of readStreamForProbe) {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize >= maxBufferSize) {
        break;
      }
    }

    readStreamForProbe.destroy();

    const buffer = Buffer.concat(chunks);
    const dimensions = imageSize(buffer);

    if (!dimensions.width || !dimensions.height) {
      throw new Error("Could not determine image dimensions");
    }

    if (
      dimensions.width <= maxSizePixels &&
      dimensions.height <= maxSizePixels
    ) {
      // Upload without resizing
      const readStream = file.getReadStream({ auth, version: "original" });
      const writeStream = file.getWriteStream({
        auth,
        version: "processed",
      });

      logger.info(
        {
          dimensions: { width: dimensions.width, height: dimensions.height },
          maxSize: maxSizePixels,
        },
        "Image already within size limits, skipping ConvertAPI"
      );

      await pipeline(readStream, writeStream);

      return new Ok(undefined);
    }
  } catch (err) {
    // If dimension check fails, fall back to ConvertAPI for safety
    logger.warn(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        err: normalizeError(err),
      },
      "Failed to check image dimensions, falling back to ConvertAPI"
    );
  }

  // ConvertAPI flow
  if (!process.env.CONVERTAPI_API_KEY) {
    throw new Error("CONVERTAPI_API_KEY is not set");
  }

  const originalFormat = extensionsForContentType(file.contentType)[0].replace(
    ".",
    ""
  );
  const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);

  let result;
  try {
    // Upload the original file content directly to ConvertAPI to avoid exposing a signed URL
    // which could be fetched by the third-party service. This still sends the file contents to
    // ConvertAPI for conversion but removes the use of a signed download URL.
    const uploadResult = await convertapi.upload(
      file.getReadStream({ auth, version: "original" }),
      `${file.fileName}.${originalFormat}`
    );

    result = await convertapi.convert(
      originalFormat,
      {
        File: uploadResult,
        ScaleProportions: true,
        ImageResolution: "72",
        ScaleImage: "true",
        ScaleIfLarger: "true",
        ...resizeParams,
      },
      originalFormat,
      30
    );
  } catch (e) {
    return new Err(
      new Error(`Failed resizing image: ${normalizeError(e).message}`)
    );
  }

  const writeStream = file.getWriteStream({
    auth,
    version: "processed",
  });

  try {
    const stream = await createReadableFromUrl(result.file.url);

    await pipeline(stream, writeStream);
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
  if (!isTextExtractionSupportedContentType(file.contentType)) {
    return new Err(
      new Error(
        "Failed extracting text from file. Cannot extract text from this file type " +
          +`${file.contentType}. Action: check than caller filters out unsupported file types.`
      )
    );
  }
  try {
    const readStream = file.getReadStream({
      auth,
      version: "original",
    });
    const writeStream = file.getWriteStream({
      auth,
      version: "processed",
    });

    const processedStream = await new TextExtraction(
      config.getTextExtractionUrl(),
      { enableOcr: true, logger }
    ).fromStream(readStream, file.contentType);

    await pipeline(processedStream, writeStream);

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

export const extractTextFromAudioAndUpload: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  // Only handle supported audio types via getProcessingFunction gate.
  // Strategy:
  // 1) Buffer original audio stream to a temporary file on disk.
  // 2) Build a minimal formidable-like File pointing to that temp filepath.
  // 3) Use transcribeFile to obtain transcript text.
  // 4) Write transcript to the processed version in file storage.
  // 5) Ensure cleanup of the temporary file.
  const readStream = file.getReadStream({ auth, version: "original" });

  // Determine a helpful extension from content type for tmp filename.
  const ext = extensionsForContentType(file.contentType)[0] || "";
  const tmpFile = fileSync({ postfix: ext });

  try {
    // 1) Persist the audio to disk for the transcribe service (expects a formidable-like File).
    const ws = fs.createWriteStream(tmpFile.name);
    await pipeline(readStream, ws);

    // 2) Build a minimal formidable-like File. The transcribe service only requires
    //    `filepath` and `originalFilename` to create a FileLike stream.
    const fLike = {
      filepath: tmpFile.name,
      originalFilename: file.fileName,
    };

    // 3) Transcribe.
    const tr = await transcribeFile(fLike);
    if (tr.isErr()) {
      logger.error(
        {
          fileModelId: file.id,
          workspaceId: auth.workspace()?.sId,
          error: tr.error,
        },
        "Failed to transcribe audio file."
      );
      return new Err(
        new Error(`Failed transcribing audio file. ${tr.error.message}`)
      );
    }

    // 4) Store transcript in processed version as plain text.
    const transcript = tr.value;
    const writeStream = file.getWriteStream({
      auth,
      version: "processed",
      overrideContentType: "text/plain", // Explicitly set content type to plain text as it's a transcription
    });
    await pipeline(Readable.from(transcript), writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to extract text from Audio."
    );

    const errorMessage =
      err instanceof Error ? err.message : "Unexpected error";
    return new Err(
      new Error(`Failed extracting text from Audio. ${errorMessage}`)
    );
  } finally {
    // 5) Cleanup temp file.
    try {
      tmpFile.removeCallback();
    } catch (e) {
      // Best-effort cleanup; log but do not fail the processing on cleanup error.
      logger.warn(
        { err: e },
        "Failed to remove temp audio file after transcription."
      );
    }
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

const getProcessingFunction = ({
  auth,
  contentType,
  useCase,
}: {
  auth: Authenticator;
  contentType: AllSupportedFileContentType;
  useCase: FileUseCase;
}): ProcessingFunction | undefined => {
  // Interactive Content file types are not processed.
  if (isInteractiveContentFileContentType(contentType)) {
    return undefined;
  }

  // SVG files are stored as-is without any processing (no resize).
  if (contentType === "image/svg+xml") {
    if (["conversation", "project_context", "tool_output"].includes(useCase)) {
      return storeRawText;
    }
    return undefined;
  }

  if (isSupportedImageContentType(contentType)) {
    if (useCase === "conversation" || useCase === "project_context") {
      return makeResizeAndUploadImageToFileStorage(
        CONVERSATION_IMG_MAX_SIZE_PIXELS
      );
    } else if (useCase === "avatar") {
      return resizeAndUploadToPublicBucket;
    }
    return undefined;
  }

  if (isSupportedDelimitedTextContentType(contentType)) {
    if (
      contentType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      contentType === "application/vnd.ms-excel"
    ) {
      // We use Tika to extract from Excel files, it will turn into an HTML table
      // We will upsert from the HTML table later
      return extractTextFromFileAndUpload;
    } else if (
      [
        "conversation",
        "upsert_document",
        "folders_document",
        "upsert_table",
        "tool_output",
        "project_context",
      ].includes(useCase)
    ) {
      return storeRawText;
    }
    return undefined;
  }

  if (isSupportedAudioContentType(contentType)) {
    if (
      (useCase === "conversation" || useCase === "project_context") &&
      // Only handle voice transcription if the workspace has enabled it.
      auth.getNonNullableWorkspace().metadata?.allowVoiceTranscription !== false
    ) {
      return extractTextFromAudioAndUpload;
    }
    return undefined;
  }

  switch (contentType) {
    case "application/msword":
    case "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
    case "application/vnd.ms-powerpoint":
    case "application/vnd.openxmlformats-officedocument.presentationml.presentation":
    case "application/vnd.google-apps.document":
    case "application/vnd.google-apps.presentation":
    case "application/pdf":
      if (
        [
          "conversation",
          "upsert_document",
          "folders_document",
          "project_context",
        ].includes(useCase)
      ) {
        return extractTextFromFileAndUpload;
      }
      break;
    case "application/octet-stream":
    case "text/plain":
    case "text/markdown":
    case "text/html":
    case "text/xml":
    case "text/calendar":
    case "text/css":
    case "text/javascript":
    case "text/typescript":
    case "application/json":
    case "application/xml":
    case "application/x-sh":
    case "text/x-sh":
    case "text/x-python":
    case "text/x-python-script":
    case "application/x-yaml":
    case "text/yaml":
    case "text/vnd.yaml":
    case "text/x-c":
    case "text/x-csharp":
    case "text/x-java-source":
    case "text/x-php":
    case "text/x-ruby":
    case "text/x-sql":
    case "text/x-swift":
    case "text/x-rust":
    case "text/x-go":
    case "text/x-kotlin":
    case "text/x-scala":
    case "text/x-groovy":
    case "text/x-perl":
    case "text/x-perl-script":
    case "message/rfc822":
      if (
        [
          "conversation",
          "upsert_document",
          "tool_output",
          "folders_document",
          "project_context",
        ].includes(useCase)
      ) {
        return storeRawText;
      }
      break;
    case "text/vnd.dust.attachment.slack.thread":
      if (useCase === "conversation" || useCase === "project_context") {
        return storeRawText;
      }
      break;
    case "text/vnd.dust.attachment.pasted":
      if (useCase === "conversation" || useCase === "project_context") {
        return storeRawText;
      }
      break;
    case "application/vnd.dust.section.json":
      if (useCase === "tool_output") {
        return storeRawText;
      }
      break;
    // Processing is assumed to be irrelevant for internal mime types.
    default:
      if (isDustMimeType(contentType)) {
        break;
      }
      assertNever(contentType);
  }

  return undefined;
};

export const isUploadSupported = (arg: {
  auth: Authenticator;
  contentType: SupportedFileContentType;
  useCase: FileUseCase;
}): boolean => {
  const processing = getProcessingFunction(arg);
  return !!processing;
};

const maybeApplyProcessing: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const start = performance.now();

  const processing = getProcessingFunction({ auth, ...file });
  if (!processing) {
    return new Err(
      new Error(
        `Processing not supported for content type ${file.contentType} and use case ${file.useCase}`
      )
    );
  }

  const res = await processing(auth, file);

  const elapsed = performance.now() - start;
  logger.info(
    {
      file: file.toPublicJSON(auth),
      elapsed,
      error: res.isErr() ? res.error : undefined,
    },
    "Processed file"
  );

  if (res.isErr()) {
    return res;
  } else {
    return new Ok(undefined);
  }
};

type ProcessAndStoreFileContent =
  | {
      type: "incoming_message";
      value: IncomingMessage;
    }
  | {
      type: "string";
      value: string;
    }
  | {
      type: "readable";
      value: Readable;
    };

export type ProcessAndStoreFileError = Omit<DustError, "code"> & {
  code:
    | "internal_server_error"
    | "invalid_request_error"
    | "file_too_large"
    | "file_type_not_supported"
    | "file_is_empty";
};

export async function processAndStoreFile(
  auth: Authenticator,
  {
    file,
    content,
  }: {
    file: FileResource;
    content: ProcessAndStoreFileContent;
  }
): Promise<Result<FileResource, ProcessAndStoreFileError>> {
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
    if (content.type === "string") {
      await pipeline(
        Readable.from(content.value),
        file.getWriteStream({ auth, version: "original" })
      );
    } else if (content.type === "readable") {
      await pipeline(
        content.value,
        file.getWriteStream({ auth, version: "original" })
      );
    } else {
      const r = await parseUploadRequest(
        file,
        content.value,
        file.getWriteStream({ auth, version: "original" })
      );
      if (r.isErr()) {
        await file.markAsFailed();
        return r;
      }
    }
  } catch (err) {
    await file.markAsFailed();
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to upload file to storage."
    );

    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to upload file to storage.`,
    });
  }

  const timeoutPromise = new Promise<"timeout">((resolve) => {
    setTimeout(() => resolve("timeout"), PROCESSING_TIMEOUT_MS);
  });

  const processingRes = await Promise.race([
    maybeApplyProcessing(auth, file),
    timeoutPromise,
  ]);

  if (processingRes === "timeout") {
    await file.markAsFailed();
    return new Err({
      name: "dust_error",
      code: "file_too_large",
      message:
        "File processing timed out. The file may be too large to process. Please try with a smaller file.",
    });
  }

  if (processingRes.isErr()) {
    await file.markAsFailed();
    // Unfortunately, there is no better way to catch this image format error.
    const code = processingRes.error.message.includes(
      "Input buffer contains unsupported image format"
    )
      ? "file_type_not_supported"
      : "internal_server_error";

    return new Err({
      name: "dust_error",
      code,
      message: `Failed to process the file : ${processingRes.error}`,
    });
  }

  await file.markAsReady();
  return new Ok(file);
}
