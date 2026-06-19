import config from "@app/lib/api/config";
import type { ResizeOptions } from "@app/lib/api/files/processing/image_converter/base";
import {
  ImageConverter,
  ImageConverterError,
} from "@app/lib/api/files/processing/image_converter/base";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import { readableStreamToReadable } from "@app/types/shared/utils/streams";
import crypto from "crypto";
import type { Readable } from "stream";

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

export class ImgproxyImageConverter extends ImageConverter {
  // imgproxy fetches the source itself, so it resizes from a (signed) URL.
  async resizeFromUrl(
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
