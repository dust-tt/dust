import type { ProcessAndStoreFileError } from "@app/lib/api/files/processing";
import {
  isUploadSupportedForContentType,
  processAndStoreFile,
} from "@app/lib/api/files/processing";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { FileResource } from "@app/lib/resources/file_resource";
import {
  AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE,
  isAudioTranscriptionAvailable,
} from "@app/lib/workspace_policies";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
  SupportedImageContentType,
} from "@app/types/files";
import {
  ensureFileSize,
  isSupportedAudioContentType,
  isSupportedFileContentType,
} from "@app/types/files";
import { isComputerFeatureEnabled } from "@app/types/shared/feature_flags";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import { Readable } from "stream";

export async function validateFileUpload(
  auth: Authenticator,
  {
    contentType,
    fileName,
    fileSize,
    useCase,
  }: {
    contentType: string;
    fileName: string;
    fileSize: number;
    useCase: FileUseCase;
  }
): Promise<
  Result<
    { contentType: SupportedFileContentType; hasSandboxTools: boolean },
    ProcessAndStoreFileError
  >
> {
  if (!isSupportedFileContentType(contentType)) {
    return new Err({
      name: "dust_error",
      code: "file_type_not_supported",
      message: `Content type "${contentType}" is not supported.`,
    });
  }

  if (
    isSupportedAudioContentType(contentType) &&
    !isAudioTranscriptionAvailable({
      owner: auth.getNonNullableWorkspace(),
      plan: auth.getNonNullablePlan(),
    })
  ) {
    return new Err({
      name: "dust_error",
      code: "file_type_not_supported",
      message: AUDIO_TRANSCRIPTION_UNAVAILABLE_MESSAGE,
    });
  }

  if (!isUploadSupportedForContentType({ contentType, useCase })) {
    return new Err({
      name: "dust_error",
      code: "file_type_not_supported",
      message: `Content type "${contentType}" is not supported for use-case ${useCase}.`,
    });
  }

  const hasSandboxTools = isComputerFeatureEnabled(await getFeatureFlags(auth));
  if (!ensureFileSize(contentType, fileSize, { hasSandboxTools, useCase })) {
    return new Err({
      name: "dust_error",
      code: "file_too_large",
      message: `File "${fileName}" is too large.`,
    });
  }

  return new Ok({ contentType, hasSandboxTools });
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
    const response = await untrustedFetch(url);
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
        value: Readable.fromWeb(response.body),
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
  retry?: boolean;
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
    retry: true,
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
  const buffer = Buffer.from(base64, "base64");

  return uploadReadableToFileStorage(auth, {
    readable: Readable.from(buffer),
    fileSize: buffer.length,
    contentType,
    fileName,
    useCase,
    useCaseMetadata,
  });
}

export async function uploadReadableToFileStorage(
  auth: Authenticator,
  {
    readable,
    fileSize,
    contentType,
    fileName,
    useCase,
    useCaseMetadata,
  }: {
    readable: Readable;
    fileSize: number;
    contentType: SupportedFileContentType | SupportedImageContentType;
    fileName: string;
    useCase: FileUseCase;
    useCaseMetadata?: FileUseCaseMetadata;
  }
): Promise<Result<FileResource, ProcessAndStoreFileError>> {
  const file = await FileResource.makeNew({
    workspaceId: auth.getNonNullableWorkspace().id,
    userId: auth.user()?.id ?? null,
    contentType,
    fileName,
    fileSize,
    useCase,
    useCaseMetadata,
  });

  const res = await processAndStoreFile(auth, {
    file,
    content: { type: "readable", value: readable },
  });

  if (res.isErr()) {
    await file.markAsFailed();
    return res;
  }

  return new Ok(file);
}
