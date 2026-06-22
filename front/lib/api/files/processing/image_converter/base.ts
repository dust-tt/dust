import type { Result } from "@app/types/shared/result";
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

/**
 * ImageConverter abstracts the underlying image processing service (imgproxy, ConvertAPI) for
 * resizing raster images, returning a stream of the resized image. Providers differ in how they
 * read the source: imgproxy fetches it from a (signed) URL, ConvertAPI uploads the bytes. Each
 * provider overrides only the mode it supports; the unsupported mode keeps the throwing default.
 */
export abstract class ImageConverter {
  async resizeFromUrl(
    _sourceUrl: string,
    _options: ResizeOptions
  ): Promise<Result<Readable, ImageConverterError>> {
    throw new Error("resizeFromUrl is not supported by this converter");
  }

  // TODO: remove once imgproxy fully replaces ConvertAPI.
  async resizeFromStream(
    _sourceStream: Readable,
    _fileName: string,
    _options: ResizeOptions
  ): Promise<Result<Readable, ImageConverterError>> {
    throw new Error("resizeFromStream is not supported by this converter");
  }
}
