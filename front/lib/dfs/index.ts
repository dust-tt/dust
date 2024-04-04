import type { Bucket } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import type formidable from "formidable";
import fs from "fs";
import { pipeline } from "stream/promises";

import config from "@app/lib/dfs/config";

type BucketKeyType = "PRIVATE_UPLOAD" | "PUBLIC_UPLOAD";

const storage = new Storage({
  keyFilename: config.getServiceAccount(),
});

const bucketKeysToBucket: Record<BucketKeyType, Bucket> = {
  PRIVATE_UPLOAD: storage.bucket(config.getGcsPrivateUploadsBucket()),
  PUBLIC_UPLOAD: storage.bucket(config.getGcsPublicUploadBucket()),
};

class DFS {
  private readonly bucket: Bucket;

  constructor(bucketKey: BucketKeyType) {
    this.bucket = bucketKeysToBucket[bucketKey];
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
          contentType: file.mimetype,
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
    contentType: string;
    filePath: string;
  }) {
    const gcsFile = this.file(filePath);

    await gcsFile.save(content, {
      contentType,
    });
  }

  /**
   * Download functions.
   */

  async fetchFileContent(filePath: string) {
    const gcsFile = this.file(filePath);

    const [content] = await gcsFile.download();

    return content.toString();
  }

  async getFileContentType(filename: string): Promise<string | null> {
    const gcsFile = this.file(filename);

    const [metadata] = await gcsFile.getMetadata();

    return metadata.contentType;
  }

  file(filename: string) {
    return this.bucket.file(filename);
  }

  get name() {
    return this.bucket.name;
  }
}

export const getPrivateUploadBucket = () => new DFS("PRIVATE_UPLOAD");

export const getPublicUploadBucket = () => new DFS("PUBLIC_UPLOAD");
