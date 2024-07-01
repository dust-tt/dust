import type { Result, SupportedFileContentType } from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import sharp from "sharp";
import { pipeline } from "stream/promises";

import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

const resizeAndUploadToFileStorage: PreprocessingFunction = async (
  auth: Authenticator,
  fileRes: FileResource
) => {
  const readStream = fileRes.getReadStream(auth, "original");

  // Resize the image, preserving the aspect ratio. Longest side is max 768px.
  const resizedImageStream = sharp().resize(768, 768, {
    fit: sharp.fit.inside, // Ensure longest side is 768px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 768px.
  });

  const writeStream = fileRes.getWriteStream(auth, "processed");

  try {
    await pipeline(readStream, resizedImageStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    await fileRes.markAsFailed();

    logger.error(
      {
        fileId: fileRes.sId,
        workspaceId: auth.workspace()?.sId,
        error: err,
      },
      "Failed to resize image."
    );

    return new Err(err as Error);
  }
};

// Preprocessing for file upload.

type PreprocessingFunction = (
  auth: Authenticator,
  fileRes: FileResource
) => Promise<Result<undefined, Error>>;

type PreprocessingPerContentType = {
  [k in SupportedFileContentType]: PreprocessingFunction | undefined;
};

const processingPerContentType: Partial<PreprocessingPerContentType> = {
  "image/jpeg": resizeAndUploadToFileStorage,
  "image/png": resizeAndUploadToFileStorage,
};

export async function maybeApplyPreProcessing(
  auth: Authenticator,
  fileRes: FileResource
): Promise<Result<undefined, Error>> {
  const processing = processingPerContentType[fileRes.contentType];

  if (processing) {
    const res = await processing(auth, fileRes);
    if (res.isErr()) {
      return res;
    }
  }

  await fileRes.markAsReady();

  return new Ok(undefined);
}
