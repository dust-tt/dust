import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import assert from "assert";
import gunzip from "gunzip-maybe";
import PQueue from "p-queue";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as tar from "tar-stream";

import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
import { sanitizeGcsObjectName } from "@connectors/connectors/github/lib/code/gcs_repository";
import {
  isSupportedDirectory,
  isSupportedFile,
} from "@connectors/connectors/github/lib/code/supported_files";
import {
  isGithubRequestErrorNotFound,
  isGithubRequestErrorRepositoryAccessBlocked,
  RepositoryAccessBlockedError,
} from "@connectors/connectors/github/lib/errors";
import { ExternalOAuthTokenError } from "@connectors/lib/error";
import type { Logger } from "@connectors/logger/logger";

export const MAX_FILE_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_CONCURRENT_GCS_UPLOADS = 200;

interface TarExtractionOptions {
  repoId: number;
  connectorId: number;
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
    childLogger.info(
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

export async function extractGitHubTarballToGCS(
  tarballStream: Readable,
  { repoId, connectorId }: TarExtractionOptions,
  logger: Logger
): Promise<
  Result<
    TarExtractionResult,
    ExternalOAuthTokenError | RepositoryAccessBlockedError
  >
> {
  // Initialize GCS manager.
  const gcsManager = new GCSRepositoryManager();
  const gcsBasePath = gcsManager.generateBasePath(connectorId, repoId);

  // Track results.
  let filesUploaded = 0;
  let filesSkipped = 0;
  const seenDirs = new Set<string>();

  // Create upload queue to limit concurrent GCS uploads.
  const uploadQueue = new PQueue({ concurrency: MAX_CONCURRENT_GCS_UPLOADS });
  const uploadErrors: unknown[] = [];

  // Create tar stream extractor.
  const extract = tar.extract();

  const childLogger = logger.child({
    gcsBasePath,
  });

  childLogger.info(
    { repoId, connectorId, gcsBasePath },
    "Starting GitHub tarball extraction to GCS"
  );

  extract.on("entry", (header, stream, next) => {
    // The tar archive is streamed sequentially, meaning you must drain each entry's stream
    // as you get them or else the main extract stream will receive backpressure and stop reading.
    const drainAndNext = () => {
      stream.on("end", () => next());
      stream.resume();
    };

    try {
      if (header.type === "file") {
        const { cleanPath, filePath, fileName } = parseGitHubPath(header.name);

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
          childLogger.info(
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
          childLogger.info(
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
          childLogger.info(
            { dirPath: cleanPath },
            "Found directory in tarball"
          );
        }

        // Drain directory stream to prevent backpressure.
        drainAndNext();
      } else {
        // Skip non-file/directory entries but drain to prevent backpressure.
        childLogger.info(
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

  // Stream: GitHub tarball -> gunzip -> tar extract -> GCS upload.
  await pipeline(tarballStream, gunzip(), extract);

  childLogger.info({ repoId, connectorId }, "All files uploaded");

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
}
