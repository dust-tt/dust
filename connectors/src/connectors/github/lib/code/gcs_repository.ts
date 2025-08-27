import type { Bucket, File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import { chunk } from "lodash";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";

import { getCodeDirInternalId } from "@connectors/connectors/github/lib/utils";
import { connectorsConfig } from "@connectors/connectors/shared/config";
import { concurrentExecutor } from "@connectors/lib/async_utils";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { isDevelopment } from "@connectors/types";

export const DIRECTORY_PLACEHOLDER_FILE = ".gitkeep";
export const DIRECTORY_PLACEHOLDER_METADATA = "isDirectoryPlaceholder";
const DUST_INTERNAL_MARKER = "dustInternalMarker";
const DUST_INTERNAL_INDEX_FILE = "DUST_INTERNAL_INDEX_v1";

const DUST_INTERNAL_INDEX_FILE_PREFIX = "._dust_internal_index";

const DEFAULT_MAX_RESULTS = 1000;
const STREAM_THRESHOLD_BYTES = 2 * 1024 * 1024; // 2MB - files smaller than this will be buffered.
const GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

// Files are faster to upsert than directories, so we can afford to have more files per index file.
const FILES_PER_INDEX = 4000; // Files per index file.
const DIRECTORIES_PER_INDEX = 1500; // Directories per index file.

const PARALLEL_INDEX_UPLOADS = 10; // Concurrent index file uploads.

/**
 * Sanitizes a string to be used as a GCS object name by removing characters that are not allowed by
 * Google Cloud Storage object naming restrictions.
 * See https://cloud.google.com/storage/docs/objects#naming.
 */
export function sanitizeGcsObjectName(path: string): string {
  return path
    .replace(/[\r\n]/g, "_") // Replace carriage return and line feed.
    .replace(/[:"<>|]/g, "_") // Replace Windows-incompatible characters.
    .replace(/_{2,}/g, "_") // Consolidate underscores.
    .trim(); // Remove whitespace.
}

interface DirectoryListing {
  dirPath: string;
  gcsPath: string;
  internalId: string;
  parentInternalId: string | null;
}

interface FileListing {
  gcsPath: string;
  relativePath: string;
}

/**
 * A wrapper around GCS operations for GitHub repository code sync.
 * Handles the temporary storage of repository files during sync process.
 */
export class GCSRepositoryManager {
  private storage: Storage;
  private bucket: Bucket;

  constructor() {
    this.storage = new Storage({
      keyFilename: isDevelopment()
        ? connectorsConfig.getServiceAccount()
        : undefined,
    });
    this.bucket = this.storage.bucket(
      connectorsConfig.getDustTmpSyncBucketName()
    );
  }

  /**
   * Generate a unique GCS base path for a repository sync.
   */
  generateBasePath(connectorId: number, repoId: number): string {
    return `${connectorId}/github-repos/${repoId}/${Date.now()}`;
  }

  /**
   * Get the underlying GCS bucket (needed for streaming operations).
   */
  getBucket(): Bucket {
    return this.bucket;
  }

  /**
   * List all files in a repository's GCS path.
   */
  async listFiles(
    gcsBasePath: string,
    options?: {
      maxResults?: number;
      pageToken?: string;
    }
  ): Promise<{
    files: Array<File>;
    nextPageToken?: string;
    hasMore: boolean;
  }> {
    const [files, details] = await this.bucket.getFiles({
      prefix: gcsBasePath,
      maxResults: options?.maxResults || DEFAULT_MAX_RESULTS,
      pageToken: options?.pageToken,
      autoPaginate: false, // Don't auto-paginate, we'll handle it manually.
    });

    return {
      files,
      nextPageToken: details?.pageToken,
      hasMore: details?.pageToken !== undefined,
    };
  }

  /**
   * Download file content from GCS.
   */
  async downloadFile(gcsPath: string): Promise<Buffer> {
    try {
      const [content] = await this.bucket.file(gcsPath).download();
      return content;
    } catch (error) {
      logger.error({ error, gcsPath }, "Failed to download file from GCS");
      throw new Error(`Failed to download file: ${gcsPath}`);
    }
  }

  /**
   * Upload content to GCS.
   */
  async uploadFile(
    gcsPath: string,
    content: string | Buffer,
    options?: {
      contentType?: string;
      metadata?: Record<string, string>;
    }
  ): Promise<void> {
    try {
      const file = this.bucket.file(gcsPath);

      await file.save(content, {
        metadata: {
          contentType: options?.contentType || "text/plain",
        },
      });

      if (options?.metadata) {
        await file.setMetadata({
          metadata: options.metadata,
        });
      }
    } catch (error) {
      logger.error({ error, gcsPath }, "Failed to upload file to GCS");
      throw new Error(`Failed to upload file: ${gcsPath}`);
    }
  }

  /**
   * Create a directory placeholder file.
   */
  async createDirectoryPlaceholder(
    gcsBasePath: string,
    dirPath: string
  ): Promise<void> {
    const gcsPath = `${gcsBasePath}/${dirPath}/${DIRECTORY_PLACEHOLDER_FILE}`;

    try {
      // Check if the file already exists before creating it
      const file = this.bucket.file(gcsPath);
      const [exists] = await file.exists();

      if (exists) {
        logger.info(
          { dirPath, gcsPath },
          "Directory placeholder already exists, skipping creation"
        );
        return;
      }

      await this.uploadFile(gcsPath, "", {
        contentType: "text/plain",
        metadata: {
          [DIRECTORY_PLACEHOLDER_METADATA]: "true",
        },
      });
    } catch (error) {
      logger.error(
        { error, dirPath, gcsPath },
        "Failed to create directory placeholder in GCS"
      );
      throw error;
    }
  }

  /**
   * Upload a file from a stream using a hybrid approach based on file size:
   *
   * - Small files (< `STREAM_THRESHOLD_BYTES`MB): Buffer the entire stream content in memory and use uploadFile().
   *   This provides better error handling since the upload is synchronous and can be easily
   *   retried without stream complications. Most files fall into this category.
   *
   * - Large files (≥ `STREAM_THRESHOLD_BYTES`MB): Stream content directly to GCS using createWriteStream().
   *   This avoids loading large files into memory but has more complex error handling
   *   since streams can fail partway through and are harder to retry.
   *
   * The threshold balances memory usage vs error handling complexity.
   */
  async uploadFileStream(
    gcsPath: string,
    stream: Readable,
    options: {
      size?: number;
      contentType?: string;
      metadata?: Record<string, string>;
      childLogger?: Logger;
    } = {}
  ): Promise<void> {
    const {
      size = 0,
      contentType = "text/plain",
      metadata,
      childLogger = logger,
    } = options;

    try {
      if (size < STREAM_THRESHOLD_BYTES) {
        // Small file - buffer content and use uploadFile for better error handling.
        const chunks: Buffer[] = [];

        for await (const chunk of stream) {
          chunks.push(chunk);
        }

        const content = Buffer.concat(chunks);
        await this.uploadFile(gcsPath, content, { contentType, metadata });
      } else {
        // Large file - stream directly to GCS.
        const file = this.bucket.file(gcsPath);

        await pipeline(
          stream,
          file.createWriteStream({
            metadata: {
              contentType,
              customMetadata: metadata,
            },
            resumable: size >= GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES,
            validation: false,
          })
        );
      }
    } catch (error) {
      childLogger.error(
        { error, gcsPath, size },
        "Failed to upload file stream to GCS"
      );
      throw new Error(`Failed to upload file stream: ${gcsPath}`);
    }
  }

  /**
   * Create an index file containing all file and directory paths for the repository.
   * This is used to optimize memory usage in temporal workflows by storing paths in GCS
   * instead of passing large arrays through temporal activities.
   */
  async createIndexFiles(
    gcsBasePath: string,
    repoId: number,
    options?: {
      batchSize?: number;
      childLogger?: Logger;
    }
  ): Promise<string[]> {
    const { batchSize = DEFAULT_MAX_RESULTS, childLogger = logger } =
      options || {};

    const indexBasePath = `${gcsBasePath}/${DUST_INTERNAL_INDEX_FILE_PREFIX}`;
    const directories: Array<DirectoryListing> = [];
    const files: Array<FileListing> = [];

    // Collect all files and directories with pagination.
    let pageToken: string | undefined;
    do {
      const result = await this.listFiles(gcsBasePath, {
        maxResults: batchSize,
        pageToken,
      });

      for (const file of result.files) {
        const relativePath = file.name.replace(`${gcsBasePath}/`, "");

        if (file.name.endsWith(`/${DIRECTORY_PLACEHOLDER_FILE}`)) {
          // This is a directory placeholder.
          const dirPath = relativePath.replace(
            `/${DIRECTORY_PLACEHOLDER_FILE}`,
            ""
          );
          directories.push({
            gcsPath: file.name,
            dirPath,
            internalId: getCodeDirInternalId(repoId, dirPath),
            parentInternalId: dirPath.includes("/")
              ? getCodeDirInternalId(
                  repoId,
                  dirPath.split("/").slice(0, -1).join("/")
                )
              : null,
          });
        } else {
          // This is a regular file.
          files.push({
            gcsPath: file.name,
            relativePath,
          });
        }
      }

      pageToken = result.nextPageToken;
    } while (pageToken);

    // Split files and directories into separate chunks.
    const fileChunks = chunk(files, FILES_PER_INDEX);
    const directoryChunks = chunk(directories, DIRECTORIES_PER_INDEX);

    childLogger.info(
      {
        gcsBasePath,
        totalFiles: files.length,
        totalDirectories: directories.length,
        totalFileChunks: fileChunks.length,
        totalDirectoryChunks: directoryChunks.length,
        totalIndexFiles: fileChunks.length + directoryChunks.length,
      },
      "Creating separate index files for files and directories"
    );
    const indexPaths: string[] = [];

    // Create separate chunks for files and directories.
    const indexChunks = [
      // File chunks.
      ...fileChunks.map((fileChunk, index) => ({
        index,
        path: `${indexBasePath}_files_${index}.json`,
        data: {
          files: fileChunk,
          directories: [], // No directories in file chunks.
          indexNumber: index,
          totalFileIndexes: fileChunks.length,
          createdAt: new Date().toISOString(),
        },
      })),
      // Directory chunks.
      ...directoryChunks.map((directoryChunk, index) => ({
        index: fileChunks.length + index, // Continue numbering after file chunks.
        path: `${indexBasePath}_directories_${index}.json`,
        data: {
          files: [], // No files in directory chunks.
          directories: directoryChunk,
          indexNumber: index,
          totalDirectoryIndexes: directoryChunks.length,
          createdAt: new Date().toISOString(),
        },
      })),
    ];

    // Upload index files.
    await concurrentExecutor(
      indexChunks,
      async (chunk) => {
        await this.uploadFile(chunk.path, JSON.stringify(chunk.data), {
          contentType: "application/json",
          metadata: {
            [DUST_INTERNAL_MARKER]: DUST_INTERNAL_INDEX_FILE,
            repoId: repoId.toString(),
            gcsBasePath,
            indexNumber: chunk.index.toString(),
          },
        });

        indexPaths.push(chunk.path);
        return chunk.path;
      },
      { concurrency: PARALLEL_INDEX_UPLOADS }
    );

    childLogger.info(
      {
        gcsBasePath,
        totalIndexes: indexPaths.length,
        totalFileChunks: fileChunks.length,
        totalDirectoryChunks: directoryChunks.length,
      },
      "Created separate index files for files and directories"
    );

    return indexPaths;
  }

  /**
   * Validate that an index file was created by Dust and is safe to read.
   */
  private async validateIndexFile(
    indexPath: string,
    expectedGcsBasePath: string
  ): Promise<void> {
    const file = this.bucket.file(indexPath);
    const [metadata] = await file.getMetadata();

    // Check if this is a Dust internal index file.
    if (
      metadata.metadata?.[DUST_INTERNAL_MARKER] !== DUST_INTERNAL_INDEX_FILE
    ) {
      throw new Error("Invalid index file: not a Dust internal index file");
    }

    // Validate that the index file matches the expected GCS base path.
    if (metadata.metadata.gcsBasePath !== expectedGcsBasePath) {
      throw new Error("Invalid index file: GCS base path mismatch");
    }
  }

  /**
   * Read all files from a specific index file.
   */
  async readFilesFromIndex(
    indexPath: string,
    expectedGcsBasePath: string
  ): Promise<Array<FileListing>> {
    await this.validateIndexFile(indexPath, expectedGcsBasePath);

    const indexContent = await this.downloadFile(indexPath);
    const indexData = JSON.parse(indexContent.toString());

    return indexData.files;
  }

  /**
   * Read all directories from a specific index file.
   */
  async readDirectoriesFromIndex({
    indexPath,
    expectedGcsBasePath,
  }: {
    indexPath: string;
    expectedGcsBasePath: string;
  }): Promise<Array<DirectoryListing>> {
    await this.validateIndexFile(indexPath, expectedGcsBasePath);

    const indexContent = await this.downloadFile(indexPath);
    const indexData = JSON.parse(indexContent.toString());

    return indexData.directories;
  }
}
