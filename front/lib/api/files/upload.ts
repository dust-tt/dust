// eslint-disable-next-line dust/enforce-client-types-in-public-api
import { isDustMimeType } from "@dust-tt/client";
import ConvertAPI from "convertapi";
import fs from "fs";
import type { IncomingMessage } from "http";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileSync } from "tmp";

import config from "@app/lib/api/config";
import { parseUploadRequest } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { FileResource } from "@app/lib/resources/file_resource";
import { transcribeFile } from "@app/lib/utils/transcribe_service";
import logger from "@app/logger/logger";
import type {
  AllSupportedFileContentType,
  FileUseCase,
  FileUseCaseMetadata,
  Result,
  SupportedFileContentType,
  SupportedImageContentType,
} from "@app/types";
import { isSupportedAudioContentType } from "@app/types";
import { isContentCreationFileContentType, normalizeError } from "@app/types";
import {
  assertNever,
  Err,
  extensionsForContentType,
  isSupportedDelimitedTextContentType,
  isSupportedFileContentType,
  isSupportedImageContentType,
  isTextExtractionSupportedContentType,
  Ok,
  TextExtraction,
  validateUrl,
} from "@app/types";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 1; // 1 minute.

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

const createReadableFromUrl = async (url: string): Promise<Readable> => {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch from URL: ${response.statusText}`);
  }
  return Readable.fromWeb(response.body as any); // Type assertion needed due to Node.js types mismatch
};

const resizeAndUploadToFileStorage: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  /* Skipping sharp() to check if it's the cause of high CPU / memory usage.
  const readStream = file.getReadStream({
    auth,
    version: "original",
  });

  // Explicitly disable Sharp's cache to prevent memory accumulation.
  sharp.cache(false);

  // Set global concurrency limit to prevent too many parallel operations.
  sharp.concurrency(2);

  // Anthropic https://docs.anthropic.com/en/docs/build-with-claude/vision#evaluate-image-size
  // OpenAI https://platform.openai.com/docs/guides/vision#calculating-costs

  // Anthropic recommends <= 1568px on any side.
  // OpenAI recommends <= 2048px on the longest side, 768px on the shortest side.

  // Resize the image, preserving the aspect ratio based on the longest side compatible with both
  // models. In the case of GPT, it might incur a resize on their side as well, but doing the math here
  // would mean downloading the file first instead of streaming it.

  const resizedImageStream = sharp().resize(1568, 1568, {
    fit: sharp.fit.inside, // Ensure the longest side is 1568px.
    withoutEnlargement: true, // Avoid upscaling if the image is smaller than 1568px.
  });
  */

  if (!process.env.CONVERTAPI_API_KEY) {
    throw new Error("CONVERTAPI_API_KEY is not set");
  }

  const originalFormat = extensionsForContentType(file.contentType)[0].replace(
    ".",
    ""
  );
  const originalUrl = await file.getSignedUrlForDownload(auth, "original");
  const convertapi = new ConvertAPI(process.env.CONVERTAPI_API_KEY);

  let result;
  try {
    result = await convertapi.convert(
      originalFormat,
      {
        File: originalUrl,
        ScaleProportions: true,
        ImageResolution: "72",
        ScaleImage: "true",
        ScaleIfLarger: "true",
        ImageHeight: "1538",
        ImageWidth: "1538",
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
    const writeStream = file.getWriteStream({ auth, version: "processed" });
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

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

const getProcessingFunction = ({
  contentType,
  useCase,
}: {
  contentType: AllSupportedFileContentType;
  useCase: FileUseCase;
}): ProcessingFunction | undefined => {
  // Frame file types are not processed.
  if (isContentCreationFileContentType(contentType)) {
    return undefined;
  }

  if (isSupportedImageContentType(contentType)) {
    if (useCase === "conversation") {
      return resizeAndUploadToFileStorage;
    } else if (useCase === "avatar") {
      return uploadToPublicBucket;
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
      ].includes(useCase)
    ) {
      return storeRawText;
    }
    return undefined;
  }

  if (isSupportedAudioContentType(contentType)) {
    if (useCase === "conversation") {
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
        ["conversation", "upsert_document", "folders_document"].includes(
          useCase
        )
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
      if (
        [
          "conversation",
          "upsert_document",
          "tool_output",
          "folders_document",
        ].includes(useCase)
      ) {
        return storeRawText;
      }
      break;
    case "text/vnd.dust.attachment.slack.thread":
      if (useCase === "conversation") {
        return storeRawText;
      }
      break;
    case "text/vnd.dust.attachment.pasted":
      if (useCase === "conversation") {
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

  const processing = getProcessingFunction(file);
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

  const processingRes = await maybeApplyProcessing(auth, file);
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

export async function processAndStoreFromUrl(
  auth: Authenticator,
  {
    url,
    useCase,
    useCaseMetadata,
    fileName,
    contentType,
  }: {
    url: string;
    useCase: FileUseCase;
    useCaseMetadata?: FileUseCaseMetadata;
    fileName?: string;
    contentType?: string;
  }
): ReturnType<typeof processAndStoreFile> {
  const validUrl = validateUrl(url);
  if (!validUrl.valid) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: "Invalid URL",
    });
  }

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return new Err({
        name: "dust_error",
        code: "invalid_request_error",
        message: `Failed to fetch URL: ${response.statusText}`,
      });
    }

    if (!response.body) {
      return new Err({
        name: "dust_error",
        code: "invalid_request_error",
        message: "Response body is null",
      });
    }

    const contentLength = response.headers.get("content-length");
    const finalContentType =
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      contentType ||
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      response.headers.get("content-type") ||
      "application/octet-stream";

    if (!isSupportedFileContentType(finalContentType)) {
      return new Err({
        name: "dust_error",
        code: "invalid_request_error",
        message: "Unsupported content type",
      });
    }

    const file = await FileResource.makeNew({
      workspaceId: auth.getNonNullableWorkspace().id,
      userId: auth.user()?.id ?? null,
      contentType: finalContentType,
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      fileName: fileName || new URL(url).pathname.split("/").pop() || "file",
      fileSize: contentLength ? parseInt(contentLength) : 1024 * 1024 * 10, // Default 10MB if no content-length
      useCase,
      useCaseMetadata,
    });

    return await processAndStoreFile(auth, {
      file,
      content: {
        type: "readable",
        value: Readable.fromWeb(response.body as any),
      },
    });
  } catch (error) {
    return new Err({
      name: "dust_error",
      code: "internal_server_error",
      message: `Failed to create file from URL: ${error}`,
    });
  }
}

interface UploadBase64DataToFileStorageArgs {
  base64: string;
  contentType: SupportedFileContentType | SupportedImageContentType;
  fileName: string;
  useCase: FileUseCase;
  useCaseMetadata?: FileUseCaseMetadata;
}

export async function uploadBase64ImageToFileStorage(
  auth: Authenticator,
  {
    base64,
    contentType,
    fileName,
    useCase,
    useCaseMetadata,
  }: UploadBase64DataToFileStorageArgs & {
    contentType: SupportedImageContentType;
  }
): Promise<Result<FileResource, ProcessAndStoreFileError>> {
  // Remove data URL prefix for any supported image type.
  const base64Data = base64.replace(/^data:image\/[a-z]+;base64,/, "");

  return uploadBase64DataToFileStorage(auth, {
    base64: base64Data,
    contentType,
    fileName,
    useCase,
    useCaseMetadata,
  });
}

export async function uploadBase64DataToFileStorage(
  auth: Authenticator,
  {
    base64,
    contentType,
    fileName,
    useCase,
    useCaseMetadata,
  }: UploadBase64DataToFileStorageArgs
): Promise<Result<FileResource, ProcessAndStoreFileError>> {
  // Convert base64 to buffer.
  const buffer = Buffer.from(base64, "base64");

  const fileSizeInBytes = buffer.length;

  // Upload the buffer to the file storage.
  const file = await FileResource.makeNew({
    workspaceId: auth.getNonNullableWorkspace().id,
    userId: auth.user()?.id ?? null,
    contentType,
    fileName,
    fileSize: fileSizeInBytes,
    useCase,
    useCaseMetadata,
  });

  const res = await processAndStoreFile(auth, {
    file,
    content: {
      type: "readable",
      value: Readable.from(buffer),
    },
  });

  if (res.isErr()) {
    await file.markAsFailed();
    return res;
  }

  return new Ok(file);
}
