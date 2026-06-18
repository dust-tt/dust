import type { LoggerInterface } from "@app/types/shared/logger";
import type { Result } from "@app/types/shared/result";
import type { Readable } from "stream";

export interface ResizeImageInput {
  // A signed, fetchable URL of the source image. Providers that fetch the
  // source themselves (e.g. imgproxy) use this.
  getSourceUrl: () => Promise<string>;
  // Opens a readable stream over the source bytes. Providers that upload the
  // source (e.g. ConvertAPI) use this.
  getSourceStream: () => Readable;
  fileName: string;
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

/**
 * ImageConverter abstracts the underlying image processing service (imgproxy, ConvertAPI) for
 * resizing raster images. Callers get a stream of the resized image and stay provider-agnostic.
 */
export abstract class ImageConverter {
  constructor(readonly logger: LoggerInterface) {}

  abstract resize(
    input: ResizeImageInput
  ): Promise<Result<Readable, ImageConverterError>>;
}
