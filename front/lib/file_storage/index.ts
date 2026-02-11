import type { Bucket } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import type formidable from "formidable";
import fs from "fs";
import isNumber from "lodash/isNumber";
import { pipeline } from "stream/promises";

import config from "@app/lib/file_storage/config";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { AllSupportedFileContentType } from "@app/types/files";
import { frameContentType } from "@app/types/files";
import { stripNullBytes } from "@app/types/shared/utils/string_utils";

const DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS = 5 * 60 * 1000; // 5 minutes.

interface FileStorageOptions {
  useServiceAccount?: boolean;
}

export class FileStorage {
  private readonly bucket: Bucket;
  private readonly storage: Storage;

  constructor(
    bucketKey: string,
    { useServiceAccount }: FileStorageOptions = { useServiceAccount: true }
  ) {
    this.storage = new Storage({
      keyFilename: useServiceAccount ? config.getServiceAccount() : undefined,
    });

    this.bucket = this.storage.bucket(bucketKey);
  }

  /**
   * Upload functions.
   */

  async uploadFileToBucket(file: formidable.File, destPath: string) {
    const gcsFile = this.file(destPath);
    const fileStream = fs.createReadStream(file.filepath);

    await pipeline(
      fileStream,
      gcsFile.createWriteStream({
        metadata: {
          contentType: file.mimetype ?? undefined,
        },
      })
    );
  }

  async uploadRawContentToBucket({
    content,
    contentType,
    filePath,
  }: {
    content: string;
    contentType: AllSupportedFileContentType;
    filePath: string;
  }) {
    const gcsFile = this.file(filePath);

    const contentToSave = Buffer.from(stripNullBytes(content), "utf8");

    await gcsFile.save(contentToSave, {
      contentType,
    });
  }

  /**
   * Download functions.
   */

  async fetchFileContent(filePath: string) {
    const gcsFile = this.file(filePath);

    const [content] = await gcsFile.download();
    const [metadata] = await gcsFile.getMetadata();
    const contentType = metadata.contentType;

    if (this.isTextBasedContentType(contentType)) {
      return stripNullBytes(content.toString());
    }

    return content.toString();
  }

  private isTextBasedContentType(contentType?: string): boolean {
    if (!contentType) {
      return true;
    }

    const textTypes = [
      frameContentType,
      "text/",
      "application/json",
      "application/xml",
      "image/svg+xml",
    ];

    return textTypes.some((type) => contentType.startsWith(type));
  }

  async getFileContentType(filename: string): Promise<string | undefined> {
    const gcsFile = this.file(filename);

    const [metadata] = await gcsFile.getMetadata();

    return metadata.contentType;
  }

  async getSignedUrl(
    filename: string,
    {
      expirationDelayMs,
      promptSaveAs,
    }: { expirationDelayMs: number; promptSaveAs?: string } = {
      expirationDelayMs: DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
    }
  ): Promise<string> {
    const gcsFile = this.file(filename);

    const signedUrl = await gcsFile.getSignedUrl({
      version: "v4",
      action: "read",
      expires: new Date().getTime() + expirationDelayMs,
      promptSaveAs,
    });

    return signedUrl.toString();
  }

  file(filename: string) {
    return this.bucket.file(filename);
  }

  async getFiles({
    maxResults,
    prefix,
  }: {
    prefix?: string;
    maxResults: number;
  }) {
    const [files] = await this.bucket.getFiles({ prefix, maxResults });

    return files;
  }

  async getSortedFileVersions({
    filePath,
    maxResults,
  }: {
    filePath: string;
    maxResults?: number;
  }) {
    try {
      const [files] = await this.bucket.getFiles({
        prefix: filePath,
        versions: true,
        maxResults,
      });

      // Filter to only the exact file path and sort by generation (newest first)
      // Generation represents the version order in GCS
      // can be string or number per GCS types, though in practice it seems to always be a number
      const versions = files
        .filter((file) => file.name === filePath)
        .sort((a, b) => {
          const genA = isNumber(a.metadata.generation)
            ? a.metadata.generation
            : Number(a.metadata.generation ?? 0);
          const genB = isNumber(b.metadata.generation)
            ? b.metadata.generation
            : Number(b.metadata.generation ?? 0);
          return genB - genA;
        });

      return versions;
    } catch {
      return [];
    }
  }

  get name() {
    return this.bucket.name;
  }

  /**
   * Delete functions.
   */

  async delete(
    filePath: string,
    { ignoreNotFound }: { ignoreNotFound?: boolean } = {}
  ) {
    try {
      return await this.file(filePath).delete();
    } catch (err) {
      if (ignoreNotFound && isGCSNotFoundError(err)) {
        return;
      }

      throw err;
    }
  }
}

const bucketInstances = new Map();

export const getBucketInstance: (
  bucketConfig: string,
  options?: FileStorageOptions
) => FileStorage = (bucketConfig, options) => {
  if (!bucketInstances.has(bucketConfig)) {
    bucketInstances.set(bucketConfig, new FileStorage(bucketConfig, options));
  }
  return bucketInstances.get(bucketConfig);
};

export const getPrivateUploadBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getGcsPrivateUploadsBucket(), options);

export const getPublicUploadBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getGcsPublicUploadBucket(), options);

export const getUpsertQueueBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getGcsUpsertQueueBucket(), options);

export const getDustDataSourcesBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getDustDataSourcesBucket(), options);

export const getWebhookRequestsBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getWebhookRequestsBucket(), options);

export const getLLMTracesBucket = (options?: FileStorageOptions) =>
  getBucketInstance(config.getLLMTracesBucket(), options);
