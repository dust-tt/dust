import config from "@app/lib/api/config";
import { buildImgproxyUrl } from "@app/lib/api/files/processing/imgproxy";
import type { Authenticator } from "@app/lib/auth";
import { hasFeatureFlag } from "@app/lib/auth";
import { untrustedFetch } from "@app/lib/egress/server";
import type { FileResource } from "@app/lib/resources/file_resource";
import logger from "@app/logger/logger";
import { extensionsForContentType } from "@app/types/files";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { readableStreamToReadable } from "@app/types/shared/utils/streams";
import ConvertAPI from "convertapi";
import imageSize from "image-size";
import sharp from "sharp";
import { Readable } from "stream";
import { pipeline } from "stream/promises";

const CONVERSATION_IMG_MAX_SIZE_PIXELS = 1538;
const AVATAR_IMG_MAX_SIZE_PIXELS = 256;
const BRANDING_LOGO_MAX_SIZE_PIXELS = 512;
const BRANDING_FAVICON_MAX_SIZE_PIXELS = 256;

function getMaxSizePixels(file: FileResource): number {
  if (file.useCase === "avatar") {
    return AVATAR_IMG_MAX_SIZE_PIXELS;
  }

  if (file.useCase === "workspace_branding") {
    return file.useCaseMetadata?.asset === "favicon"
      ? BRANDING_FAVICON_MAX_SIZE_PIXELS
      : BRANDING_LOGO_MAX_SIZE_PIXELS;
  }

  return CONVERSATION_IMG_MAX_SIZE_PIXELS;
}

async function createReadableFromInternalUrl(url: string): Promise<Readable> {
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch from URL: ${response.statusText}`);
  }

  return readableStreamToReadable(response.body);
}

async function createReadableFromUntrustedUrl(url: string): Promise<Readable> {
  const response = await untrustedFetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Failed to fetch from URL: ${response.statusText}`);
  }

  return Readable.fromWeb(response.body);
}

async function rasterizeSvg(
  auth: Authenticator,
  file: FileResource,
  maxSizePixels: number
): Promise<Result<undefined, Error>> {
  try {
    const readStream = file.getReadStream({ auth, version: "original" });
    const writeStream = file.getWriteStream({
      auth,
      version: "processed",
      overrideContentType: "image/png",
    });

    await pipeline(
      readStream,
      sharp()
        .resize(maxSizePixels, maxSizePixels, {
          fit: "inside",
          withoutEnlargement: true,
        })
        .png(),
      writeStream
    );

    return new Ok(undefined);
  } catch (err) {
    return new Err(
      new Error(`Failed rasterizing SVG: ${normalizeError(err).message}`)
    );
  }
}

async function resizeViaImgproxy(
  auth: Authenticator,
  file: FileResource,
  maxSizePixels: number,
  originalFormat: string
): Promise<Result<undefined, Error>> {
  try {
    const sourceUrl = await file.getSignedUrlForInlineView(auth);
    const imgproxyUrl = buildImgproxyUrl({
      sourceUrl,
      maxSizePixels,
      extension: originalFormat,
    });

    const stream = await createReadableFromInternalUrl(imgproxyUrl);
    const writeStream = file.getWriteStream({ auth, version: "processed" });
    await pipeline(stream, writeStream);
    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        err: normalizeError(err),
      },
      "Failed to resize image."
    );
    return new Err(
      new Error(`Failed resizing image. ${normalizeError(err).message}`)
    );
  }
}

async function resizeViaConvertAPI(
  auth: Authenticator,
  file: FileResource,
  maxSizePixels: number,
  originalFormat: string
): Promise<Result<undefined, Error>> {
  const convertapi = new ConvertAPI(config.getConvertAPIKey());
  const maxSizeStr = maxSizePixels.toString();

  let result;
  try {
    const uploadResult = await convertapi.upload(
      file.getReadStream({ auth, version: "original" }),
      `${file.fileName}.${originalFormat}`
    );

    result = await convertapi.convert(
      originalFormat,
      {
        File: uploadResult,
        ScaleProportions: true,
        ImageResolution: "72",
        ScaleImage: "true",
        ScaleIfLarger: "true",
        ImageHeight: maxSizeStr,
        ImageWidth: maxSizeStr,
      },
      originalFormat,
      30
    );
  } catch (e) {
    return new Err(
      new Error(`Failed resizing image: ${normalizeError(e).message}`)
    );
  }

  try {
    const stream = await createReadableFromUntrustedUrl(result.file.url);
    const writeStream = file.getWriteStream({ auth, version: "processed" });
    await pipeline(stream, writeStream);
    return new Ok(undefined);
  } catch (err) {
    logger.error(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        err: normalizeError(err),
      },
      "Failed to resize image."
    );
    return new Err(
      new Error(`Failed resizing image. ${normalizeError(err).message}`)
    );
  }
}

async function resizeRasterImage(
  auth: Authenticator,
  file: FileResource,
  maxSizePixels: number
): Promise<Result<undefined, Error>> {
  try {
    const readStreamForProbe = file.getReadStream({
      auth,
      version: "original",
    });

    // Read first 32KB (sufficient for all image format headers).
    const chunks: Buffer[] = [];
    let totalSize = 0;
    const maxBufferSize = 32 * 1024;

    for await (const chunk of readStreamForProbe) {
      chunks.push(chunk);
      totalSize += chunk.length;
      if (totalSize >= maxBufferSize) {
        break;
      }
    }

    readStreamForProbe.destroy();

    const buffer = Buffer.concat(chunks);
    const dimensions = imageSize(buffer);

    if (!dimensions.width || !dimensions.height) {
      throw new Error("Could not determine image dimensions");
    }

    if (
      dimensions.width <= maxSizePixels &&
      dimensions.height <= maxSizePixels
    ) {
      const readStream = file.getReadStream({ auth, version: "original" });
      const writeStream = file.getWriteStream({ auth, version: "processed" });

      logger.info(
        {
          dimensions: { width: dimensions.width, height: dimensions.height },
          maxSizePixels,
        },
        "Image already within size limits, skipping resize"
      );

      await pipeline(readStream, writeStream);
      return new Ok(undefined);
    }
  } catch (err) {
    // If dimension check fails, proceed to resize for safety.
    logger.warn(
      {
        fileModelId: file.id,
        workspaceId: auth.workspace()?.sId,
        err: normalizeError(err),
      },
      "Failed to check image dimensions, proceeding to resize"
    );
  }

  const originalFormat = extensionsForContentType(file.contentType)[0].replace(
    ".",
    ""
  );

  if (await hasFeatureFlag(auth, "imgproxy_image_resize")) {
    return resizeViaImgproxy(auth, file, maxSizePixels, originalFormat);
  }

  return resizeViaConvertAPI(auth, file, maxSizePixels, originalFormat);
}

export async function processImage(
  auth: Authenticator,
  file: FileResource
): Promise<Result<undefined, Error>> {
  const maxSizePixels = getMaxSizePixels(file);

  if (file.contentType === "image/svg+xml") {
    return rasterizeSvg(auth, file, maxSizePixels);
  }

  const resizeResult = await resizeRasterImage(auth, file, maxSizePixels);
  if (resizeResult.isErr()) {
    return resizeResult;
  }

  // Avatar images are also copied to the public bucket.
  if (file.useCase === "avatar") {
    const readStream = file.getReadStream({ auth, version: "processed" });
    const writeStream = file.getWriteStream({ auth, version: "public" });
    try {
      await pipeline(readStream, writeStream);
    } catch (err) {
      return new Err(
        new Error(
          `Failed uploading to public bucket. ${normalizeError(err).message}`
        )
      );
    }
  }

  return new Ok(undefined);
}
