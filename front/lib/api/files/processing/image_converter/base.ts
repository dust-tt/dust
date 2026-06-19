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
