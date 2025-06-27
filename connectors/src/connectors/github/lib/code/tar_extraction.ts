import type { Result } from "@dust-tt/client";
import { Err, Ok } from "@dust-tt/client";
import assert from "assert";
import gunzip from "gunzip-maybe";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";
import * as tar from "tar-stream";

import { GCSRepositoryManager } from "@connectors/connectors/github/lib/code/gcs_repository";
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
import logger from "@connectors/logger/logger";

const MAX_FILE_SIZE_BYTES = 1024 * 1024; // 1MB
const GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

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

function shouldProcessFile(header: tar.Headers, pathParts: string[]): boolean {
  // Skip non-files.
  if (header.type !== "file") {
    return false;
  }

  // Skip large files.
  if (header.size && header.size > MAX_FILE_SIZE_BYTES) {
    logger.info(
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
    logger.info(
      { path: header.name, pathParts },
      "File has no name, skipping."
    );
    return false;
  }

  // Check extension whitelist and filename whitelist.
  const isWhitelisted = isSupportedFile(fileName);
  if (!isWhitelisted) {
    logger.info(
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
  // GitHub tarballs have format: "reponame-hash/path/to/file.ext".
  // We need to remove the first part (reponame-hash).
  const pathParts = originalPath.split("/").slice(1);

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
  { repoId, connectorId }: TarExtractionOptions
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
  const uploadPromises: Promise<void>[] = [];

  // Create tar stream extractor.
  const extract = tar.extract();

  logger.info(
    { repoId, connectorId, gcsBasePath },
    "Starting GitHub tarball extraction to GCS"
  );

  extract.on("entry", (header, stream, next) => {
    try {
      if (header.type === "file") {
        const { cleanPath, filePath, fileName } = parseGitHubPath(header.name);

        if (shouldProcessFile(header, [...filePath, fileName])) {
          // Upload file to GCS with preserved hierarchy.
          const gcsPath = `${gcsBasePath}/${cleanPath}`;
          const gcsFile = gcsManager.getBucket().file(gcsPath);

          // Track directories for placeholder creation immediately.
          for (let i = 0; i < filePath.length; i++) {
            const dirPath = filePath.slice(0, i + 1).join("/");
            if (!seenDirs.has(dirPath)) {
              seenDirs.add(dirPath);
            }
          }

          // Count file immediately (before upload).
          filesUploaded++;

          logger.info({ gcsPath, fileName, filePath }, "Uploading file to GCS");

          const uploadPromise = pipeline(
            stream,
            gcsFile.createWriteStream({
              metadata: {
                contentType: "text/plain",
              },
              resumable: header.size >= GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES,
              validation: false,
            })
          ).catch((error) => {
            logger.error(
              {
                error,
                gcsPath,
                fileName,
                filePath,
                repoId,
                connectorId,
              },
              "Failed to upload file to GCS"
            );
            // Re-throw to ensure the upload failure is visible.
            throw error;
          });

          uploadPromises.push(uploadPromise);
        } else {
          // Skip this file - resume stream.
          filesSkipped++;
          logger.info(
            { fileName: header.name },
            "Skipping file (filtered out)"
          );
          stream.resume();
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
          logger.info({ dirPath: cleanPath }, "Found directory in tarball");
        }

        // Resume stream (no content to process for directories).
        stream.resume();
      } else {
        // Skip other types (symlinks, etc.) - resume stream.
        logger.info(
          { fileName: header.name, type: header.type },
          "Skipping non-file/directory entry"
        );
        stream.resume();
      }
    } catch (error) {
      if (isGithubRequestErrorNotFound(error)) {
        return new Err(new ExternalOAuthTokenError(error));
      }
      if (isGithubRequestErrorRepositoryAccessBlocked(error)) {
        return new Err(new RepositoryAccessBlockedError(error));
      }

      logger.error(
        { error, header },
        "Error processing tarball entry, resuming stream."
      );
      stream.resume();
    }

    next();
  });

  // Stream: GitHub tarball -> gunzip -> tar extract -> GCS upload.
  await pipeline(tarballStream, gunzip(), extract);

  // Wait for all file uploads to complete.
  const uploadResults = await Promise.allSettled(uploadPromises);
  const failedUploads = uploadResults.filter((r) => r.status === "rejected");

  if (failedUploads.length > 0) {
    logger.error(
      {
        repoId,
        connectorId,
        failedCount: failedUploads.length,
        totalAttempted: uploadPromises.length,
      },
      "Some file uploads failed during GitHub extraction"
    );
  }

  // Create directory placeholder files to preserve GitHub hierarchy.
  const directoryPromises = Array.from(seenDirs).map(async (dirPath) =>
    gcsManager.createDirectoryPlaceholder(gcsBasePath, dirPath)
  );

  await Promise.all(directoryPromises);

  logger.info(
    {
      repoId,
      connectorId,
      gcsBasePath,
      filesUploaded,
      filesSkipped,
      directoriesCreated: seenDirs.size,
      uploadFailures: failedUploads.length,
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
