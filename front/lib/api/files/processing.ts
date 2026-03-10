import config from "@app/lib/api/config";
import { isSupportedForAvatar } from "@app/lib/api/files/use_cases/avatar";
import { isSupportedForConversation } from "@app/lib/api/files/use_cases/conversation";
import { isSupportedForFoldersDocument } from "@app/lib/api/files/use_cases/folders_document";
import { isSupportedForProjectContext } from "@app/lib/api/files/use_cases/project_context";
import { isSupportedForSkillAttachment } from "@app/lib/api/files/use_cases/skill_attachment";
import { isSupportedForToolOutput } from "@app/lib/api/files/use_cases/tool_output";
import { isSupportedForUpsertDocument } from "@app/lib/api/files/use_cases/upsert_document";
import { isSupportedForUpsertTable } from "@app/lib/api/files/use_cases/upsert_table";
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
} from "@app/types/files";
import { extensionsForContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  isTextExtractionSupportedContentType,
  TextExtraction,
} from "@app/types/shared/text_extraction";
import { assertNever } from "@app/types/shared/utils/assert_never";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import ConvertAPI from "convertapi";
import fs from "fs";
import type { IncomingMessage } from "http";
import imageSize from "image-size";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileSync } from "tmp";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.
const PROCESSING_TIMEOUT_MS = 1000 * 60 * 5; // 5 minutes.
const CONVERSATION_IMG_MAX_SIZE_PIXELS = "1538";
const AVATAR_IMG_MAX_SIZE_PIXELS = "256";

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

// Images processing functions.

const createReadableFromUrl = async (url: string): Promise<Readable> => {
  const response = await untrustedFetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch from URL: ${response.statusText}`);
  }
  return Readable.fromWeb(response.body);
};

const resizeImage: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const maxSize =
    file.useCase === "avatar"
      ? AVATAR_IMG_MAX_SIZE_PIXELS
      : CONVERSATION_IMG_MAX_SIZE_PIXELS;

  const resizeResult = await resizeAndWriteToProcessed(auth, file, maxSize);
  if (resizeResult.isErr()) {
    return resizeResult;
  }

  // Avatar images are also copied to the public bucket.
  if (file.useCase === "avatar") {
    const readStream = file.getReadStream({ auth, version: "processed" });
    const writeStream = file.getWriteStream({ auth, version: "public" });
    try {
      await pipeline(readStream, writeStream);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unexpected error";
      return new Err(
        new Error(`Failed uploading to public bucket. ${errorMessage}`)
      );
    }
  }

  return new Ok(undefined);
};

/**
 * Resize an image and write the result to the "processed" version. If the image is already within
 * size limits, copies the original to processed without calling ConvertAPI.
 */
const resizeAndWriteToProcessed = async (
  auth: Authenticator,
  file: FileResource,
  maxSize: string
): Promise<Result<undefined, Error>> => {
  const maxSizePixels = parseInt(maxSize);

  // Check image dimensions before calling ConvertAPI.
  try {
    const readStreamForProbe = file.getReadStream({
      auth,
      version: "original",
    });

    // Read first 32KB (sufficient for all image format headers).
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
    // If dimension check fails, fall back to ConvertAPI for safety.
    logger.warn(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        err: normalizeError(err),
      },
      "Failed to check image dimensions, falling back to ConvertAPI"
    );
  }

  // ConvertAPI flow.
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
        ImageHeight: maxSize,
        ImageWidth: maxSize,
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

    const processedStream = await new TextExtraction(
      config.getTextExtractionUrl(),
      { enableOcr: true, logger }
    ).fromStream(readStream, file.contentType);

    const writeStream = file.getWriteStream({
      auth,
      version: "processed",
    });

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
  // Skip transcription if the workspace has disabled voice transcription.
  if (
    auth.getNonNullableWorkspace().metadata?.allowVoiceTranscription === false
  ) {
    return new Ok(undefined);
  }

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

// Preprocessing for file upload.

// Shared map: content type → processing function. Only content types that produce a meaningful
// "processed" version are listed here. Content types not in this map are used as-is (original).
const PROCESSING_BY_CONTENT_TYPE = new Map<
  AllSupportedFileContentType,
  ProcessingFunction
>([
  // Images (resized).
  ["image/jpeg", resizeImage],
  ["image/png", resizeImage],
  ["image/gif", resizeImage],
  ["image/webp", resizeImage],
  ["image/bmp", resizeImage],

  // Audio (transcribed).
  ["audio/mpeg", extractTextFromAudioAndUpload],
  ["audio/wav", extractTextFromAudioAndUpload],
  ["audio/x-wav", extractTextFromAudioAndUpload],
  ["audio/webm", extractTextFromAudioAndUpload],
  ["audio/ogg", extractTextFromAudioAndUpload],
  ["audio/x-m4a", extractTextFromAudioAndUpload],

  // Documents (text extracted via Tika).
  ["application/pdf", extractTextFromFileAndUpload],
  ["application/msword", extractTextFromFileAndUpload],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    extractTextFromFileAndUpload,
  ],
  ["application/vnd.ms-powerpoint", extractTextFromFileAndUpload],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    extractTextFromFileAndUpload,
  ],
  ["application/vnd.google-apps.document", extractTextFromFileAndUpload],
  ["application/vnd.google-apps.presentation", extractTextFromFileAndUpload],

  // Excel (text extracted via Tika → HTML table).
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    extractTextFromFileAndUpload,
  ],
  ["application/vnd.ms-excel", extractTextFromFileAndUpload],
]);

// Returns the processing function that transforms the original file into a processed version (e.g.,
// text extraction, image resize, audio transcription). Returns undefined when no transformation is
// needed — the original file is used as-is. Processing is purely content-type-driven; upload
// support per use case is handled separately by the per-use-case files.
const getProcessingFunction = (
  contentType: AllSupportedFileContentType
): ProcessingFunction | undefined => {
  return PROCESSING_BY_CONTENT_TYPE.get(contentType);
};

// Whether uploading this content type for this use case is supported. Dispatches to per-use-case
// files that each define their own set of supported content types.
export function isUploadSupportedForContentType({
  contentType,
  useCase,
}: {
  contentType: AllSupportedFileContentType;
  useCase: FileUseCase;
}): boolean {
  switch (useCase) {
    case "conversation":
      return isSupportedForConversation(contentType);
    case "avatar":
      return isSupportedForAvatar(contentType);
    case "tool_output":
      return isSupportedForToolOutput(contentType);
    case "project_context":
      return isSupportedForProjectContext(contentType);
    case "skill_attachment":
      return isSupportedForSkillAttachment(contentType);
    case "upsert_document":
      return isSupportedForUpsertDocument(contentType);
    case "folders_document":
      return isSupportedForFoldersDocument(contentType);
    case "upsert_table":
      return isSupportedForUpsertTable(contentType);
    default:
      assertNever(useCase);
  }
}

/**
 * Whether a file with this content type has a meaningful processed version (e.g., text extraction,
 * image resize, audio transcription). When false, readers should use the "original" version
 * directly. Purely content-type-driven — no use-case branching.
 */
export function hasProcessedVersion(
  contentType: AllSupportedFileContentType
): boolean {
  return getProcessingFunction(contentType) !== undefined;
}

const maybeApplyProcessing = async (
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> => {
  const processing = getProcessingFunction(file.contentType);
  if (!processing) {
    // No processing needed. The original file is used as-is.
    return new Ok(undefined);
  }

  const start = performance.now();
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

  await file.markAsReady(auth);

  return new Ok(file);
}
