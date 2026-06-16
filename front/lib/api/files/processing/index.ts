import config from "@app/lib/api/config";
import { processImage } from "@app/lib/api/files/processing/images";
import { isSandboxRawDelimitedConversationFile } from "@app/lib/api/files/sandbox_raw";
import { isSupportedForAvatar } from "@app/lib/api/files/use_cases/avatar";
import { isSupportedForConversation } from "@app/lib/api/files/use_cases/conversation";
import { isSupportedForFoldersDocument } from "@app/lib/api/files/use_cases/folders_document";
import { isSupportedForProjectContext } from "@app/lib/api/files/use_cases/project_context";
import { isSupportedForSkillAttachment } from "@app/lib/api/files/use_cases/skill_attachment";
import { isSupportedForToolOutput } from "@app/lib/api/files/use_cases/tool_output";
import { isSupportedForUpsertDocument } from "@app/lib/api/files/use_cases/upsert_document";
import { isSupportedForUpsertTable } from "@app/lib/api/files/use_cases/upsert_table";
import { isSupportedForWorkspaceBranding } from "@app/lib/api/files/use_cases/workspace_branding";
import { parseUploadRequest } from "@app/lib/api/files/utils";
import type { Authenticator } from "@app/lib/auth";
import type { DustError } from "@app/lib/error";
import { withRetryOnTransientGCSError } from "@app/lib/file_storage";
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
import fs from "fs";
import type { IncomingMessage } from "http";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import { fileSync } from "tmp";

const UPLOAD_DELAY_AFTER_CREATION_MS = 1000 * 60 * 2; // 2 minute.
const PROCESSING_TIMEOUT_MS = 1000 * 60 * 5; // 5 minutes.

type ProcessingFunction = (
  auth: Authenticator,
  file: FileResource
) => Promise<Result<undefined, Error>>;

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
      overrideContentType: "text/plain",
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

    return new Err(
      new Error(
        `Failed extracting text from File. ${normalizeError(err).message}`
      )
    );
  }
};

export const extractTextFromAudioAndUpload: ProcessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  // Skip transcription for BYOK workspaces (voice uses third-party services).
  if (auth.getNonNullablePlan().isByok) {
    return new Ok(undefined);
  }

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

    // 4) Store transcript in processed version as plain text. The source is an
    //    in-memory string, so the streams can safely be re-created on each
    //    retry attempt.
    const transcript = tr.value;
    await withRetryOnTransientGCSError(
      () =>
        pipeline(
          Readable.from(transcript),
          file.getWriteStream({
            auth,
            version: "processed",
            overrideContentType: "text/plain", // Explicitly set content type to plain text as it's a transcription
          })
        ),
      {
        operationName: "transcript upload",
        logContext: {
          fileModelId: file.id,
          workspaceId: auth.workspace()?.sId,
        },
      }
    );

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

    return new Err(
      new Error(
        `Failed extracting text from Audio. ${normalizeError(err).message}`
      )
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

// Shared map: content type -> processing function. Only content types that produce a meaningful
// "processed" version are listed here. Content types not in this map are used as-is (original).
interface ProcessingEntry {
  process: ProcessingFunction;
  processedContentType: AllSupportedFileContentType;
  // When set, this entry only applies when the predicate returns true. Omit to apply for all use cases.
  appliesTo?: (useCase: FileUseCase) => boolean;
}

const PROCESSING_BY_CONTENT_TYPE = new Map<
  AllSupportedFileContentType,
  ProcessingEntry
>([
  // Images (resized -> output keeps the original content type).
  ["image/jpeg", { process: processImage, processedContentType: "image/jpeg" }],
  ["image/png", { process: processImage, processedContentType: "image/png" }],
  ["image/gif", { process: processImage, processedContentType: "image/gif" }],
  ["image/webp", { process: processImage, processedContentType: "image/webp" }],
  ["image/bmp", { process: processImage, processedContentType: "image/bmp" }],
  // SVG/ICO: rasterized to PNG to ensure consistent rendering across clients.
  [
    "image/svg+xml",
    { process: processImage, processedContentType: "image/png" },
  ],
  [
    "image/x-icon",
    { process: processImage, processedContentType: "image/png" },
  ],

  // Audio (transcribed -> plain text).
  [
    "audio/mpeg",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "audio/wav",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "audio/x-wav",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "audio/webm",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  // Chrome sometimes uses video/webm for audio files, and we can still process them as audio only files
  [
    "video/webm",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "audio/ogg",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "audio/x-m4a",
    {
      process: extractTextFromAudioAndUpload,
      processedContentType: "text/plain",
    },
  ],

  // Spreadsheets: served through the conversation data source as queryable tables until we
  // settle on handing this off to the computer/sandbox.
  [
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
    },
  ],
  [
    "application/vnd.ms-excel",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
    },
  ],

  // Binary documents: Tika text extraction for all use cases except conversation (only tabular
  // data is indexed in the data source for conversation).
  [
    "application/pdf",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
      appliesTo: (uc) => uc !== "conversation",
    },
  ],
  [
    "application/msword",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
      appliesTo: (uc) => uc !== "conversation",
    },
  ],
  [
    "application/vnd.ms-powerpoint",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
      appliesTo: (uc) => uc !== "conversation",
    },
  ],
  [
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
      appliesTo: (uc) => uc !== "conversation",
    },
  ],
  [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    {
      process: extractTextFromFileAndUpload,
      processedContentType: "text/plain",
      appliesTo: (uc) => uc !== "conversation",
    },
  ],
]);

// Returns the processing entry for a content type and use case.
// Returns undefined when no transformation is needed. The original file is used as-is.
function getProcessingEntry(
  contentType: AllSupportedFileContentType,
  useCase?: FileUseCase
): ProcessingEntry | undefined {
  const entry = PROCESSING_BY_CONTENT_TYPE.get(contentType);
  if (!entry) {
    return undefined;
  }

  if (entry.appliesTo && useCase !== undefined && !entry.appliesTo(useCase)) {
    return undefined;
  }

  return entry;
}

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

    case "workspace_branding":
      return isSupportedForWorkspaceBranding(contentType);

    default:
      assertNever(useCase);
  }
}

/**
 * Whether a file with this content type has a meaningful processed version (e.g., text extraction,
 * image resize, audio transcription) for the given use case. When false, readers should use the
 * "original" version directly.
 */
export function hasProcessedVersion(
  contentType: AllSupportedFileContentType,
  useCase?: FileUseCase
): boolean {
  return getProcessingEntry(contentType, useCase) !== undefined;
}

/**
 * Returns the content type of the processed version for a given original content type and use
 * case. Returns undefined when there is no processed version.
 */
export function getProcessedContentType(
  contentType: AllSupportedFileContentType,
  useCase?: FileUseCase
): AllSupportedFileContentType | undefined {
  return getProcessingEntry(contentType, useCase)?.processedContentType;
}

const maybeApplyProcessing = async (
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> => {
  if (isSandboxRawDelimitedConversationFile(file)) {
    return new Ok(undefined);
  }

  const entry = getProcessingEntry(file.contentType, file.useCase);
  if (!entry) {
    // No processing needed. The original file is used as-is.
    return new Ok(undefined);
  }

  const start = performance.now();
  const res = await entry.process(auth, file);

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
      // The source is an in-memory string, so the streams can safely be
      // re-created on each attempt.
      const stringContent = content.value;
      await withRetryOnTransientGCSError(
        () =>
          pipeline(
            Readable.from(stringContent),
            file.getWriteStream({ auth, version: "original" })
          ),
        {
          operationName: "file upload (string content)",
          logContext: {
            fileModelId: file.id,
            workspaceId: auth.workspace()?.sId,
          },
        }
      );
    } else if (content.type === "readable") {
      await pipeline(
        content.value,
        file.getWriteStream({ auth, version: "original" })
      );
    } else {
      const r = await parseUploadRequest(auth, file, content.value);
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
    // Unfortunately, there is no better way to catch these errors.
    const message = processingRes.error.message;
    let code: ProcessAndStoreFileError["code"] = "internal_server_error";
    if (message.includes("Input buffer contains unsupported image format")) {
      code = "file_type_not_supported";
    } else if (message.includes("could not be processed")) {
      code = "file_too_large";
    }

    return new Err({
      name: "dust_error",
      code,
      message: `Failed to process the file: ${message}`,
    });
  }

  await file.markAsReady(auth);

  return new Ok(file);
}
