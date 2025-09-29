import type { Bucket } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import type formidable from "formidable";
import fs from "fs";
import { pipeline } from "stream/promises";

import config from "@app/lib/file_storage/config";
import { isGCSNotFoundError } from "@app/lib/file_storage/types";
import type { AllSupportedFileContentType } from "@app/types";
import { clientExecutableContentType, stripNullBytes } from "@app/types";

const DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS = 5 * 60 * 1000; // 5 minutes.

interface FileStorageOptions {
  useServiceAccount?: boolean;
}

class FileStorage {
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
    content: string | Buffer;
    contentType: AllSupportedFileContentType;
    filePath: string;
  }) {
    const gcsFile = this.file(filePath);

    const contentToSave =
      typeof content === "string"
        ? Buffer.from(stripNullBytes(content), "utf8")
        : content;

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
      clientExecutableContentType,
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
      expirationDelay,
      promptSaveAs,
    }: { expirationDelay: number; promptSaveAs?: string } = {
      expirationDelay: DEFAULT_SIGNED_URL_EXPIRATION_DELAY_MS,
    }
  ): Promise<string> {
    const gcsFile = this.file(filename);

    const signedUrl = await gcsFile.getSignedUrl({
      version: "v4",
      action: "read",
      expires: new Date().getTime() + expirationDelay,
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
