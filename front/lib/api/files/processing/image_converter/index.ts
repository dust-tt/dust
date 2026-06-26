import config from "@app/lib/api/config";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { readableStreamToReadable } from "@app/types/shared/utils/streams";
import crypto from "crypto";
import type { Readable } from "stream";

export interface ResizeOptions {
  format: string;
  maxSizePixels: number;
}

export type ImageConverterErrorCode = "resize_failed" | "network_error";

export class ImageConverterError extends Error {
  readonly code: ImageConverterErrorCode;

  constructor(code: ImageConverterErrorCode, message: string) {
    super(message);
    this.name = "ImageConverterError";
    this.code = code;
  }
}

interface BuildImgproxyUrlParams {
  sourceUrl: string;
  maxSizePixels: number;
  extension: string;
}

function buildImgproxyUrl({
  sourceUrl,
  maxSizePixels,
  extension,
}: BuildImgproxyUrlParams): string {
  const key = Buffer.from(config.getImgproxyKey(), "hex");
  const salt = Buffer.from(config.getImgproxySalt(), "hex");

  const encodedSource = Buffer.from(sourceUrl).toString("base64url");
  const path = `/rs:fit:${maxSizePixels}:${maxSizePixels}:0/${encodedSource}.${extension}`;

  const signature = crypto
    .createHmac("sha256", key)
    .update(salt)
    .update(path)
    .digest("base64url");

  return `${config.getImgproxyUrl()}/${signature}${path}`;
}

/**
 * ImageConverter resizes raster images via imgproxy, which fetches the source from a (signed) URL
 * and returns a stream of the resized image.
 */
export class ImageConverter {
  async resizeImage(
    sourceUrl: string,
    { format, maxSizePixels }: ResizeOptions
  ): Promise<Result<Readable, ImageConverterError>> {
    try {
      const imgproxyUrl = buildImgproxyUrl({
        sourceUrl,
        maxSizePixels,
        extension: format,
      });

      const response = await fetch(imgproxyUrl);
      if (!response.ok || !response.body) {
        return new Err(
          new ImageConverterError(
            "network_error",
            `Failed to fetch from imgproxy: ${response.statusText}`
          )
        );
      }

      return new Ok(readableStreamToReadable(response.body));
    } catch (err) {
      return new Err(
        new ImageConverterError("resize_failed", normalizeError(err).message)
      );
    }
  }
}
