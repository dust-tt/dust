import type { Bucket } from "@google-cloud/storage";
import { Storage } from "@google-cloud/storage";
import type formidable from "formidable";
import fs from "fs";

import config from "@app/lib/dfs/config";

type SupportedBucketKeyType = "PUBLIC_UPLOAD";

const storage = new Storage({
  keyFilename: config.getServiceAccount(),
});

const bucketKeysToBucket: Record<SupportedBucketKeyType, Bucket> = {
  PUBLIC_UPLOAD: storage.bucket(config.getPublicUploadBucket()),
};

export async function uploadToBucket(
  bucketKey: SupportedBucketKeyType,
  file: formidable.File
) {
  const bucket = bucketKeysToBucket[bucketKey];

  const gcsFile = bucket.file(file.newFilename);
  const fileStream = fs.createReadStream(file.filepath);

  return new Promise((resolve, reject) =>
    fileStream
      .pipe(
        gcsFile.createWriteStream({
          metadata: {
            contentType: file.mimetype,
          },
        })
      )
      .on("error", reject)
      .on("finish", () => resolve(gcsFile))
  );
}

export async function getFileContentType(
  bucketKey: SupportedBucketKeyType,
  filename: string
): Promise<string | null> {
  const bucket = bucketKeysToBucket[bucketKey];

  const gcsFile = bucket.file(filename);

  const [metadata] = await gcsFile.getMetadata();

  return metadata.contentType;
}
