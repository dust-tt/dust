import type { Bucket, File } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";

import { connectorsConfig } from "@connectors/connectors/shared/config";
import logger from "@connectors/logger/logger";

export const DIRECTORY_PLACEHOLDER_FILE = ".gitkeep";
export const DIRECTORY_PLACEHOLDER_METADATA = "isDirectoryPlaceholder";

/**
 * A wrapper around GCS operations for GitHub repository code sync.
 * Handles the temporary storage of repository files during sync process.
 */
export class GCSRepositoryManager {
  private storage: Storage;
  private bucket: Bucket;

  constructor() {
    this.storage = new Storage({
      keyFilename: connectorsConfig.getServiceAccount(),
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
  async listFiles(gcsBasePath: string): Promise<Array<File>> {
    const [files] = await this.bucket.getFiles({ prefix: gcsBasePath });

    return files;
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
   * Upload content to GCS (internal method).
   */
  private async uploadFile(
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

      logger.info({ gcsPath }, "File uploaded to GCS");
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

    await this.uploadFile(gcsPath, "", {
      contentType: "text/plain",
      metadata: {
        [DIRECTORY_PLACEHOLDER_METADATA]: "true",
      },
    });
  }

  /**
   * Delete all files for a repository.
   */
  async deleteRepository(connectorId: number, repoId: number): Promise<void> {
    const prefix = `${connectorId}/github-repos/${repoId}`;

    try {
      await this.bucket.deleteFiles({ prefix });
      logger.info(
        { connectorId, repoId, prefix },
        "Deleted repository from GCS"
      );
    } catch (error) {
      logger.error(
        { error, connectorId, repoId, prefix },
        "Failed to delete repository from GCS"
      );
      throw new Error(`Failed to delete repository: ${prefix}`);
    }
  }

  /**
   * Organize files by directory depth for hierarchical processing.
   */
  async organizeFilesByDepth(
    gcsBasePath: string,
    batchSize: number = 50
  ): Promise<{
    directoryBatches: Array<{
      depth: number;
      directories: Array<{
        gcsPath: string;
        dirPath: string;
      }>;
    }>;
    fileBatches: Array<{
      depth: number;
      files: Array<{
        gcsPath: string;
        relativePath: string;
      }>;
    }>;
  }> {
    const files = await this.listFiles(gcsBasePath);

    const dirsByDepth = new Map<number, Set<string>>();
    const filesByDepth = new Map<number, string[]>();

    for (const file of files) {
      const relativePath = file.name.replace(`${gcsBasePath}/`, "");

      if (relativePath.endsWith(`/${DIRECTORY_PLACEHOLDER_FILE}`)) {
        // Directory placeholder.
        const dirPath = relativePath.replace(
          `/${DIRECTORY_PLACEHOLDER_FILE}`,
          ""
        );
        const depth = dirPath.split("/").length;

        if (!dirsByDepth.has(depth)) {
          dirsByDepth.set(depth, new Set());
        }
        dirsByDepth.get(depth)!.add(dirPath);
      } else {
        // Regular file.
        const pathParts = relativePath.split("/");
        const depth = pathParts.length - 1;

        if (!filesByDepth.has(depth)) {
          filesByDepth.set(depth, []);
        }
        filesByDepth.get(depth)!.push(file.name);
      }
    }

    // Convert to sorted batches.
    const directoryBatches = Array.from(dirsByDepth.entries())
      .sort(([a], [b]) => a - b) // Sort by depth (shallow first).
      .map(([depth, dirs]) => ({
        depth,
        directories: Array.from(dirs).map((dirPath) => ({
          gcsPath: `${gcsBasePath}/${dirPath}/${DIRECTORY_PLACEHOLDER_FILE}`,
          dirPath,
        })),
      }));

    const fileBatches = Array.from(filesByDepth.entries())
      .sort(([a], [b]) => a - b)
      .map(([depth, files]) => {
        // Split large depth groups into smaller batches.
        const batches = [];
        for (let i = 0; i < files.length; i += batchSize) {
          batches.push({
            depth,
            files: files.slice(i, i + batchSize).map((gcsPath) => ({
              gcsPath,
              relativePath: gcsPath.replace(`${gcsBasePath}/`, ""),
            })),
          });
        }
        return batches;
      })
      .flat();

    return { directoryBatches, fileBatches };
  }
}
