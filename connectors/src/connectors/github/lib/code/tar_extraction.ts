import {
  GCSRepositoryManager,
  sanitizeGcsObjectName,
} from "@connectors/connectors/github/lib/code/gcs_repository";
import {
  isSupportedDirectory,
  isSupportedFile,
} from "@connectors/connectors/github/lib/code/supported_files";
import {
  describeGithubError,
  isGithubRequestErrorNotFound,
  isGithubRequestErrorRepositoryAccessBlocked,
  RepositoryAccessBlockedError,
} from "@connectors/connectors/github/lib/errors";
import { setTimeoutAsync } from "@connectors/lib/async_utils";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { Logger } from "@connectors/logger/logger";
import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import assert from "assert";
import gunzip from "gunzip-maybe";
import PQueue from "p-queue";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as tar from "tar-stream";

// If you change this value, also update the limitation message in lib/connector_providers_ui.ts
export const MAX_FILE_SIZE_BYTES = 4 * 1024 * 1024;
// codeload streams at ~1MB/s and drops connections on multi-GB archives, which are not
// resumable. Past this size the download cannot reliably complete within the activity budget.
export const MAX_TARBALL_SIZE_BYTES = 1024 * 1024 * 1024;
const MAX_CONCURRENT_GCS_UPLOADS = 400;
const MAX_TARBALL_SPOOL_RETRIES = 3;
const MAX_TARBALL_EXTRACTION_RETRIES = 3;
const TARBALL_RETRY_BASE_DELAY_MS = 1000;
const EXTRACTION_PROGRESS_LOG_INTERVAL = 1000;

const ZLIB_ERROR_CODES = ["Z_BUF_ERROR", "Z_DATA_ERROR"] as const;
type ZlibErrorCode = (typeof ZLIB_ERROR_CODES)[number];

function isIncompleteGzipStreamError(
  error: Error
): error is Error & { code: ZlibErrorCode } {
  return (
    "code" in error &&
    typeof error.code === "string" &&
    ZLIB_ERROR_CODES.includes(error.code as ZlibErrorCode)
  );
}

/**
 * Checks if an error is a retryable stream error (zlib decompression failures,
 * incomplete downloads, connection resets).
 */
function isRetryableStreamError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  if (isIncompleteGzipStreamError(error)) {
    return true;
  }

  // Check error message for common stream/network issues.
  const retryableMessages = [
    "unexpected end of file",
    "incorrect header check",
    "invalid stored block lengths",
    "other side closed",
    "ECONNRESET",
    "socket hang up",
    "terminated", // undici fetch stream termination
    "Bad credentials", // GitHub seems to return this when the OAuth token is actually still valid so we will let it retry
  ];

  return retryableMessages.some((msg) =>
    error.message.toLowerCase().includes(msg.toLowerCase())
  );
}

// Marker class to indicate tarball was not found (repo deleted/inaccessible).
export class TarballNotFoundError extends Error {
  constructor(message = "Tarball not found") {
    super(message);
    this.name = "TarballNotFoundError";
  }
}

// Marker class to indicate the tarball exceeds the supported download size.
export class TarballTooLargeError extends Error {
  constructor(readonly bytesReceived: number, readonly maxBytes: number) {
    super(
      `Tarball exceeds maximum supported size: received ${bytesReceived} bytes, limit ${maxBytes} bytes`
    );
    this.name = "TarballTooLargeError";
  }
}

export interface TarballStreamProvider {
  getStream: () => Promise<
    Result<
      { stream: Readable; contentLength: number | null },
      TarballNotFoundError
    >
  >;
}

interface TarExtractionOptions {
  repoId: number;
  connectorId: number;
  // null disables the size cap (connectors whitelisted for large repositories).
  maxTarballSizeBytes: number | null;
}

interface TarExtractionResult {
  gcsBasePath: string;
  filesUploaded: number;
  filesSkipped: number;
  directoriesCreated: number;
}

function shouldProcessFile(
  header: tar.Headers,
  pathParts: string[],
  childLogger: Logger
): boolean {
  // Skip non-files.
  if (header.type !== "file") {
    return false;
  }

  // Skip large files.
  if (header.size && header.size > MAX_FILE_SIZE_BYTES) {
    childLogger.info(
      { path: header.name, size: header.size },
      "File is over the size limit, skipping."
    );
    return false;
  }

  // Check blacklisted directories.
  for (const part of pathParts) {
    if (!isSupportedDirectory(part!)) {
      return false;
    }
  }

  // Get the actual filename (last part of the path).
  const fileName = pathParts[pathParts.length - 1];
  if (!fileName) {
    childLogger.info(
      { path: header.name, pathParts },
      "File has no name, skipping."
    );
    return false;
  }

  // Check extension whitelist and filename whitelist.
  const isWhitelisted = isSupportedFile(fileName);
  if (!isWhitelisted) {
    childLogger.debug(
      { path: header.name, fileName },
      "File not whitelisted, skipping."
    );
  }

  return isWhitelisted;
}

function parseGitHubPath(
  originalPath: string,
  { isDirectory = false }: { isDirectory?: boolean } = {}
): {
  cleanPath: string;
  filePath: string[];
  fileName: string;
} {
  // Sanitize the original path first to handle any problematic characters.
  const sanitizedPath = sanitizeGcsObjectName(originalPath);

  // GitHub tarballs have format: "reponame-hash/path/to/file.ext".
  // We need to remove the first part (reponame-hash).
  const pathParts = sanitizedPath.split("/").slice(1);

  assert(pathParts.length > 0, `Invalid path: ${originalPath}`);

  if (isDirectory) {
    // For directories, the entire path is the directory path
    // Remove trailing empty string if path ends with "/"
    const cleanParts = pathParts.filter((p) => p.length > 0);
    const dirName = cleanParts[cleanParts.length - 1] || "";
    const parentPath = cleanParts.slice(0, -1);

    return {
      cleanPath: cleanParts.join("/"),
      filePath: parentPath,
      fileName: dirName,
    };
  } else {
    // For files.
    const fileName = pathParts[pathParts.length - 1];
    assert(fileName, `Invalid path: ${originalPath}`);
    const filePath = pathParts.slice(0, -1);
    const cleanPath = pathParts.join("/");

    return { cleanPath, filePath, fileName };
  }
}

/**
 * Spool the GitHub tarball into a single GCS object at full network speed.
 *
 * Extraction (per-file GCS uploads) is orders of magnitude slower than the raw download.
 * When both share one pipeline, upload backpressure stalls the GitHub socket until
 * codeload closes it, and every retry re-downloads from scratch. Spooling keeps the
 * GitHub connection open only for the duration of the download, and lets extraction
 * retries re-read from GCS instead of GitHub.
 */
async function spoolTarballToGCS(
  tarballStreamProvider: TarballStreamProvider,
  gcsManager: GCSRepositoryManager,
  tarballGcsPath: string,
  maxTarballSizeBytes: number | null,
  childLogger: Logger
): Promise<
  Result<{ bytesSpooled: number }, TarballNotFoundError | TarballTooLargeError>
> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MAX_TARBALL_SPOOL_RETRIES; attempt++) {
    const downloadStartedAtMs = Date.now();
    let bytesReceived = 0;
    let contentLength: number | null = null;

    try {
      const streamResult = await tarballStreamProvider.getStream();

      // If the stream provider returns an error (e.g., tarball not found), propagate it.
      if (streamResult.isErr()) {
        return new Err(streamResult.error);
      }

      const { stream: tarballStream } = streamResult.value;
      contentLength = streamResult.value.contentLength;

      // Track bytes received for content-length validation.
      // Use Buffer.byteLength for strings to handle multi-byte characters correctly.
      let abortedForSize = false;
      tarballStream.on("data", (chunk: Buffer | string) => {
        bytesReceived += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk, "utf8");

        if (
          maxTarballSizeBytes !== null &&
          bytesReceived > maxTarballSizeBytes &&
          !abortedForSize
        ) {
          abortedForSize = true;
          tarballStream.destroy(
            new TarballTooLargeError(bytesReceived, maxTarballSizeBytes)
          );
        }
      });

      await gcsManager.uploadTarballStream(tarballGcsPath, tarballStream);

      // Validate content-length if provided.
      if (contentLength !== null && bytesReceived < contentLength) {
        throw new Error(
          `Incomplete tarball download: received ${bytesReceived} bytes, expected ${contentLength} bytes`
        );
      }

      childLogger.info(
        {
          bytesReceived,
          contentLength,
          downloadDurationMs: Date.now() - downloadStartedAtMs,
        },
        "Spooled GitHub tarball to GCS"
      );

      return new Ok({ bytesSpooled: bytesReceived });
    } catch (error) {
      lastError = error;

      const spoolContext = {
        ...describeGithubError(error),
        error,
        bytesReceived,
        contentLength,
        downloadDurationMs: Date.now() - downloadStartedAtMs,
        maxSpoolAttempts: MAX_TARBALL_SPOOL_RETRIES,
        missingBytes:
          contentLength !== null ? contentLength - bytesReceived : null,
        spoolAttempt: attempt,
      };

      if (error instanceof TarballTooLargeError) {
        childLogger.error(
          spoolContext,
          "Tarball exceeds maximum supported size, aborting spool"
        );
        return new Err(error);
      }

      // Check if this is a retryable error.
      if (
        isRetryableStreamError(error) &&
        attempt < MAX_TARBALL_SPOOL_RETRIES - 1
      ) {
        const delayMs = TARBALL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        childLogger.warn(
          { ...spoolContext, delay: delayMs },
          "Retryable stream error while spooling tarball to GCS, will retry"
        );
        await setTimeoutAsync(delayMs);
        continue;
      }

      // Non-retryable error or max retries reached.
      childLogger.error(
        spoolContext,
        "Non-retryable error or max retries reached while spooling tarball to GCS"
      );
      throw error;
    }
  }

  // This should not be reached, but just in case.
  throw lastError;
}

export async function extractGitHubTarballToGCS(
  tarballStreamProvider: TarballStreamProvider,
  { repoId, connectorId, maxTarballSizeBytes }: TarExtractionOptions,
  logger: Logger
): Promise<
  Result<
    TarExtractionResult,
    | ExternalOAuthTokenError
    | RepositoryAccessBlockedError
    | TarballNotFoundError
    | TarballTooLargeError
  >
> {
  // Initialize GCS manager.
  const gcsManager = new GCSRepositoryManager();
  const gcsBasePath = gcsManager.generateBasePath(connectorId, repoId);
  // The tarball is spooled outside gcsBasePath so index creation, which lists every
  // object under the base path, never sees it. The bucket lifecycle policy deletes it.
  const tarballGcsPath = gcsManager.generateTarballGcsPath(connectorId, repoId);

  const childLogger = logger.child({
    gcsBasePath,
    tarballGcsPath,
  });

  childLogger.info(
    { repoId, connectorId, gcsBasePath },
    "Starting GitHub tarball extraction to GCS"
  );

  const spoolResult = await spoolTarballToGCS(
    tarballStreamProvider,
    gcsManager,
    tarballGcsPath,
    maxTarballSizeBytes,
    childLogger
  );

  if (spoolResult.isErr()) {
    return new Err(spoolResult.error);
  }

  const { bytesSpooled } = spoolResult.value;

  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_TARBALL_EXTRACTION_RETRIES; attempt++) {
    let filesUploaded = 0;
    let filesSkipped = 0;
    const extractionStartedAtMs = Date.now();
    const seenDirs = new Set<string>();

    // Create upload queue to limit concurrent GCS uploads.
    const uploadQueue = new PQueue({ concurrency: MAX_CONCURRENT_GCS_UPLOADS });
    const uploadErrors: unknown[] = [];

    // Create tar stream extractor - must be recreated for each attempt.
    const extract = tar.extract();

    // Track bytes received for validation.
    let bytesReceived = 0;

    extract.on("entry", (header, stream, next) => {
      // When extraction aborts mid-entry (e.g. Z_BUF_ERROR on a truncated download),
      // tar-stream destroys in-flight entry streams with that error. Without a listener,
      // the resulting 'error' event crashes the process (uncaught exception). pipeline()
      // still rejects with the original error, so the retry logic is unaffected.
      stream.on("error", (err) => {
        childLogger.warn(
          { err, path: header.name },
          "Tar entry stream error during extraction"
        );
      });

      // The tar archive is streamed sequentially, meaning you must drain each entry's stream
      // as you get them or else the main extract stream will receive backpressure and stop reading.
      const drainAndNext = () => {
        stream.on("end", () => next());
        stream.resume();
      };

      try {
        if (header.type === "file") {
          const { cleanPath, filePath, fileName } = parseGitHubPath(
            header.name
          );

          if (shouldProcessFile(header, [...filePath, fileName], childLogger)) {
            // Upload file to GCS with preserved hierarchy.
            const gcsPath = `${gcsBasePath}/${cleanPath}`;

            // Track directories for placeholder creation immediately.
            for (let i = 0; i < filePath.length; i++) {
              const dirPath = filePath.slice(0, i + 1).join("/");
              if (!seenDirs.has(dirPath)) {
                seenDirs.add(dirPath);
              }
            }

            // Upload file to GCS using hybrid approach.
            filesUploaded++;
            if (filesUploaded % EXTRACTION_PROGRESS_LOG_INTERVAL === 0) {
              childLogger.info(
                {
                  filesUploaded,
                  filesSkipped,
                  extractionDurationMs: Date.now() - extractionStartedAtMs,
                  uploadsInFlight: uploadQueue.pending,
                  uploadsQueued: uploadQueue.size,
                },
                "GitHub tarball extraction progress"
              );
            }
            childLogger.debug(
              { gcsPath, fileName, filePath, filesUploaded, size: header.size },
              "Uploading file to GCS"
            );

            // Queue the upload.
            void uploadQueue.add(async () => {
              try {
                await gcsManager.uploadFileStream(gcsPath, stream, {
                  size: header.size,
                  contentType: "text/plain",
                  childLogger,
                });
              } catch (error) {
                logger.error(
                  { error, gcsPath, fileName },
                  "Error uploading file to GCS"
                );
                uploadErrors.push(error);
              }
            });

            // Continue tar extraction immediately.
            next();
          } else {
            // Skip filtered file but must drain stream to prevent backpressure.
            filesSkipped++;
            childLogger.debug(
              { fileName: header.name },
              "Skipping file (filtered out)"
            );
            drainAndNext();
          }
        } else if (header.type === "directory") {
          // Track directory entries from tarball (including empty ones).
          const { cleanPath, filePath } = parseGitHubPath(header.name, {
            isDirectory: true,
          });

          // Check if directory should be processed (not blacklisted).
          const pathParts = [...filePath, cleanPath.split("/").pop()].filter(
            (p) => p && p.length > 0
          );
          let shouldInclude = true;

          for (const part of pathParts) {
            if (!isSupportedDirectory(part!)) {
              shouldInclude = false;
              break;
            }
          }

          if (shouldInclude && cleanPath) {
            seenDirs.add(cleanPath);
            childLogger.debug(
              { dirPath: cleanPath },
              "Found directory in tarball"
            );
          }

          // Drain directory stream to prevent backpressure.
          drainAndNext();
        } else {
          // Skip non-file/directory entries but drain to prevent backpressure.
          childLogger.debug(
            { fileName: header.name, type: header.type },
            "Skipping non-file/directory entry"
          );
          drainAndNext();
        }
      } catch (error) {
        if (isGithubRequestErrorNotFound(error)) {
          return new Err(new ExternalOAuthTokenError(error));
        }
        if (isGithubRequestErrorRepositoryAccessBlocked(error)) {
          return new Err(new RepositoryAccessBlockedError(error));
        }

        childLogger.error(
          { error, header },
          "Error processing tarball entry, resuming stream."
        );
        // Drain stream to prevent backpressure despite error.
        drainAndNext();
      }
    });

    try {
      // Get a fresh read stream over the spooled tarball for this attempt.
      const tarballStream = gcsManager.createTarballReadStream(tarballGcsPath);

      // Track bytes received to validate against the spooled size.
      tarballStream.on("data", (chunk: Buffer | string) => {
        bytesReceived += Buffer.isBuffer(chunk)
          ? chunk.length
          : Buffer.byteLength(chunk, "utf8");
      });

      // Stream: spooled GCS tarball -> gunzip -> tar extract -> GCS upload.
      await pipeline(tarballStream, gunzip(), extract);

      if (bytesReceived < bytesSpooled) {
        throw new Error(
          `Incomplete tarball read from GCS: received ${bytesReceived} bytes, expected ${bytesSpooled} bytes`
        );
      }

      childLogger.info(
        { repoId, connectorId, bytesReceived, bytesSpooled },
        "Tarball extraction completed"
      );

      // Create directory placeholder files to preserve GitHub hierarchy.
      Array.from(seenDirs).forEach((dirPath) =>
        uploadQueue.add(async () => {
          try {
            await gcsManager.createDirectoryPlaceholder(gcsBasePath, dirPath);
          } catch (error) {
            childLogger.error(
              { error, dirPath, gcsBasePath },
              "Error creating directory placeholder in GCS"
            );
            uploadErrors.push(error);
          }
        })
      );

      // Wait for all queued uploads to complete.
      await uploadQueue.onIdle();

      if (uploadErrors.length > 0) {
        childLogger.error(
          { errorCount: uploadErrors.length },
          "Received GCS uploads errors, aborting"
        );
        return new Err(new Error("GCS upload errors occurred"));
      }

      childLogger.info(
        {
          repoId,
          connectorId,
          gcsBasePath,
          filesUploaded,
          filesSkipped,
          directoriesCreated: seenDirs.size,
        },
        "Completed GitHub tarball extraction to GCS"
      );

      return new Ok({
        directoriesCreated: seenDirs.size,
        filesSkipped,
        filesUploaded,
        gcsBasePath,
      });
    } catch (error) {
      lastError = error;

      const extractionContext = {
        error,
        bytesReceived,
        bytesSpooled,
        extractionAttempt: attempt,
        extractionDurationMs: Date.now() - extractionStartedAtMs,
        filesUploaded,
        maxExtractionAttempts: MAX_TARBALL_EXTRACTION_RETRIES,
        missingBytes: bytesSpooled - bytesReceived,
      };

      // Check if this is a retryable error. Retries re-read the spooled tarball from
      // GCS, so they never re-download from GitHub.
      if (
        isRetryableStreamError(error) &&
        attempt < MAX_TARBALL_EXTRACTION_RETRIES - 1
      ) {
        const delayMs = TARBALL_RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        childLogger.warn(
          { ...extractionContext, delay: delayMs },
          "Retryable stream error during tarball extraction, will retry"
        );
        await setTimeoutAsync(delayMs);
        continue;
      }

      // Non-retryable error or max retries reached.
      childLogger.error(
        extractionContext,
        "Non-retryable error or max retries reached during tarball extraction"
      );
      throw error;
    }
  }

  // This should not be reached, but just in case.
  throw lastError;
}
