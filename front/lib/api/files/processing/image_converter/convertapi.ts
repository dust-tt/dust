import config from "@app/lib/api/config";
import type { ResizeOptions } from "@app/lib/api/files/processing/image_converter/base";
import {
  ImageConverter,
  ImageConverterError,
} from "@app/lib/api/files/processing/image_converter/base";
import { untrustedFetch } from "@app/lib/egress/server";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { normalizeError } from "@app/types/shared/utils/error_utils";
import ConvertAPI from "convertapi";
import { Readable } from "stream";

const CONVERT_TIMEOUT_SECONDS = 30;

// TODO: remove this converter once imgproxy fully replaces ConvertAPI.
export class ConvertApiImageConverter extends ImageConverter {
  // ConvertAPI uploads the source bytes, so it resizes from a readable stream.
  async resizeFromStream(
    sourceStream: Readable,
    fileName: string,
    { format, maxSizePixels }: ResizeOptions
  ): Promise<Result<Readable, ImageConverterError>> {
    const convertapi = new ConvertAPI(config.getConvertAPIKey());
    const maxSizeStr = maxSizePixels.toString();

    let result;
    try {
      const uploadResult = await convertapi.upload(
        sourceStream,
        `${fileName}.${format}`
      );

      result = await convertapi.convert(
        format,
        {
          File: uploadResult,
          ScaleProportions: true,
          ImageResolution: "72",
          ScaleImage: "true",
          ScaleIfLarger: "true",
          ImageHeight: maxSizeStr,
          ImageWidth: maxSizeStr,
        },
        format,
        CONVERT_TIMEOUT_SECONDS
      );
    } catch (err) {
      return new Err(
        new ImageConverterError("resize_failed", normalizeError(err).message)
      );
    }

    try {
      const response = await untrustedFetch(result.file.url);
      if (!response.ok || !response.body) {
        return new Err(
          new ImageConverterError(
            "network_error",
            `Failed to fetch from ConvertAPI: ${response.statusText}`
          )
        );
      }

      return new Ok(Readable.fromWeb(response.body));
    } catch (err) {
      return new Err(
        new ImageConverterError("network_error", normalizeError(err).message)
      );
    }
  }
}
