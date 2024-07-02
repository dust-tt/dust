import type {
  FileUseCase,
  Result,
  SupportedFileContentType,
} from "@dust-tt/types";
import { Err, Ok } from "@dust-tt/types";
import sharp from "sharp";
import { pipeline } from "stream/promises";

import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";

const resizeAndUploadToFileStorage: PreprocessingFunction = async (
  auth: Authenticator,
  file: FileResource
) => {
  const readStream = file.getReadStream(auth, "original");

  // Resize the image, preserving the aspect ratio. Longest side is max 768px.
  const resizedImageStream = sharp().resize(768, 768, {
    fit: sharp.fit.inside, // Ensure longest side is 768px.
    withoutEnlargement: true, // Avoid upscaling if image is smaller than 768px.
  });

  const writeStream = file.getWriteStream(auth, "processed");

  try {
    await pipeline(readStream, resizedImageStream, writeStream);

    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileId: file.sId,
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
  file: FileResource
) => Promise<Result<undefined, Error>>;

type PreprocessingPerUseCase = {
  [k in FileUseCase]: PreprocessingFunction | undefined;
};

type PreprocessingPerContentType = {
  [k in SupportedFileContentType]: PreprocessingPerUseCase | undefined;
};

const processingPerContentType: Partial<PreprocessingPerContentType> = {
  "image/jpeg": {
    conversation: resizeAndUploadToFileStorage,
  },
  "image/png": {
    conversation: resizeAndUploadToFileStorage,
  },
};

export async function maybeApplyPreProcessing(
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> {
  const contentTypeProcessing = processingPerContentType[file.contentType];
  if (!contentTypeProcessing) {
    await file.markAsReady();

    return new Ok(undefined);
  }

  const processing = contentTypeProcessing[file.useCase];
  if (processing) {
    const res = await processing(auth, file);
    if (res.isErr()) {
      await file.markAsFailed();

      return res;
    }
  }

  await file.markAsReady();

  return new Ok(undefined);
}
