import type { ProcessAndStoreFileError } from "@app/lib/api/files/processing";
import { processAndStoreFile } from "@app/lib/api/files/processing";
import { validateExternalUrl } from "@app/lib/api/url_safety";
import type { Authenticator } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import { FileResource } from "@app/lib/resources/file_resource";
import type {
  FileUseCase,
  FileUseCaseMetadata,
  SupportedFileContentType,
  SupportedImageContentType,
} from "@app/types/files";
import { isSupportedFileContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { validateUrl } from "@app/types/shared/utils/url_utils";
import { Readable } from "stream";

const FETCH_FROM_URL_TIMEOUT_MS = 60_000;

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

  const urlSafetyError = await validateExternalUrl(validUrl.standardized);
  if (urlSafetyError) {
    return new Err({
      name: "dust_error",
      code: "invalid_request_error",
      message: urlSafetyError,
    });
  }

  try {
    const response = await untrustedFetch(validUrl.standardized, {
      signal: AbortSignal.timeout(FETCH_FROM_URL_TIMEOUT_MS),
    });
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
      contentType ||
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
  const fileSizeInBytes = buffer.length;

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
