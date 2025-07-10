import type { Bucket, File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import type { Readable } from "stream";
import { pipeline } from "stream/promises";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import type { Logger } from "@connectors/logger/logger";
import logger from "@connectors/logger/logger";
import { isDevelopment } from "@connectors/types";

export const DIRECTORY_PLACEHOLDER_FILE = ".gitkeep";
export const DIRECTORY_PLACEHOLDER_METADATA = "isDirectoryPlaceholder";

const DEFAULT_MAX_RESULTS = 1000;
const STREAM_THRESHOLD_BYTES = 1024 * 1024; // 1MB - files smaller than this will be buffered.
const GCS_RESUMABLE_UPLOAD_THRESHOLD_BYTES = 10 * 1024 * 1024; // 10MB

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
          customMetadata: options?.metadata,
        },
      });
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
}
