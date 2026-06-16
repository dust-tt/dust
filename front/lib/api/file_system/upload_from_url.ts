import {
  frameFileCreateRejectedError,
  frameFileEditRejectedError,
} from "@app/lib/api/actions/servers/files/tools/utils";
import type { DustFileSystem } from "@app/lib/api/file_system/dust_file_system";
import { validateExternalUrl } from "@app/lib/api/url_safety";
import { untrustedFetch } from "@app/lib/egress/server";
import {
  getFileFormatCategory,
  isInteractiveContentType,
  isSupportedFileContentType,
  MAX_FILE_SIZES,
  stripMimeParameters,
} from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import {
  sanitizeUrlForDisplay,
  validateUrl,
} from "@app/types/shared/utils/url_utils";
import { Readable, Transform } from "stream";

const UPLOAD_FROM_URL_TIMEOUT_MS = 60_000;

export type UploadFromUrlError = {
  message: string;
};

export type UploadFromUrlResult = {
  contentType: string;
  sizeBytes: number;
  existed: boolean;
};

function getMaxUploadBytes(contentType: string): number {
  const category = getFileFormatCategory(contentType);
  if (category) {
    return MAX_FILE_SIZES[category];
  }
  return MAX_FILE_SIZES.data;
}

function limitReadableStream(
  stream: Readable,
  maxBytes: number
): { stream: Readable; getBytesRead: () => number } {
  let bytesRead = 0;

  const limited = new Transform({
    transform(chunk, _encoding, callback) {
      bytesRead += chunk.length;
      if (bytesRead > maxBytes) {
        callback(
          new Error(
            `File exceeds the maximum supported size of ${Math.ceil(maxBytes / (1024 * 1024))} MB.`
          )
        );
        return;
      }
      callback(null, chunk);
    },
  });

  limited.on("error", () => stream.destroy());

  return {
    stream: stream.pipe(limited),
    getBytesRead: () => bytesRead,
  };
}

export async function uploadFileFromUrlToFileSystem(
  dustFs: DustFileSystem,
  {
    path,
    url,
    contentType: contentTypeOverride,
  }: {
    path: string;
    url: string;
    contentType?: string;
  }
): Promise<Result<UploadFromUrlResult, UploadFromUrlError>> {
  const validUrl = validateUrl(url);
  if (!validUrl.valid) {
    return new Err({ message: "Invalid URL." });
  }

  if (new URL(validUrl.standardized).protocol !== "https:") {
    return new Err({
      message: "Only public HTTPS URLs are supported.",
    });
  }

  const sanitizedUrl = sanitizeUrlForDisplay(validUrl.standardized);

  const urlSafetyError = await validateExternalUrl(validUrl.standardized);
  if (urlSafetyError) {
    return new Err({ message: urlSafetyError });
  }

  let response: Awaited<ReturnType<typeof untrustedFetch>>;
  try {
    response = await untrustedFetch(validUrl.standardized, {
      signal: AbortSignal.timeout(UPLOAD_FROM_URL_TIMEOUT_MS),
    });
  } catch {
    return new Err({ message: `Failed to fetch URL: ${sanitizedUrl}` });
  }

  if (!response.ok) {
    return new Err({
      message: `Failed to fetch URL: HTTP ${response.status} ${response.statusText}`,
    });
  }

  if (!response.body) {
    return new Err({ message: "Response body is empty." });
  }

  const finalContentType = stripMimeParameters(
    // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
    contentTypeOverride ||
      // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
      response.headers.get("content-type") ||
      "application/octet-stream"
  );

  if (isInteractiveContentType(finalContentType)) {
    return new Err({ message: frameFileCreateRejectedError().message });
  }

  if (!isSupportedFileContentType(finalContentType)) {
    return new Err({
      message: `Unsupported content type: ${finalContentType}`,
    });
  }

  const maxBytes = getMaxUploadBytes(finalContentType);
  const contentLengthHeader = response.headers.get("content-length");
  const contentLength =
    contentLengthHeader !== null
      ? parseInt(contentLengthHeader, 10)
      : undefined;
  if (
    contentLength !== undefined &&
    Number.isFinite(contentLength) &&
    contentLength > maxBytes
  ) {
    return new Err({
      message: `File exceeds the maximum supported size of ${Math.ceil(maxBytes / (1024 * 1024))} MB.`,
    });
  }

  const statResult = await dustFs.stat(path);
  if (statResult.isErr()) {
    const err = statResult.error;
    switch (err.code) {
      case "legacy_path":
      case "unauthorized":
        return new Err({ message: err.message });
      case "invalid_path":
        return new Err({ message: `Invalid path: \`${path}\`.` });
      default:
        return new Err({
          message: `Failed to read \`${path}\`: ${err.message}`,
        });
    }
  }

  const existed = statResult.value !== null;

  if (statResult.value !== null) {
    const existingMimeType = stripMimeParameters(statResult.value.contentType);
    if (isInteractiveContentType(existingMimeType)) {
      return new Err({ message: frameFileEditRejectedError().message });
    }
  }

  const sourceStream = Readable.fromWeb(response.body);
  const { stream: limitedStream, getBytesRead } = limitReadableStream(
    sourceStream,
    maxBytes
  );

  const writeResult = await dustFs.write(path, limitedStream, finalContentType);
  if (writeResult.isErr()) {
    const err = writeResult.error;
    switch (err.code) {
      case "legacy_path":
      case "unauthorized":
        return new Err({ message: err.message });
      case "invalid_path":
        return new Err({ message: `Invalid path: \`${path}\`.` });
      default:
        return new Err({
          message: `Failed to write file \`${path}\`: ${err.message}`,
        });
    }
  }

  const sizeBytes =
    contentLength !== undefined && Number.isFinite(contentLength)
      ? contentLength
      : getBytesRead();

  return new Ok({
    contentType: finalContentType,
    sizeBytes,
    existed,
  });
}
