import type { Result } from "@app/types";

/**
 * Request for generating an image from a text prompt.
 */
export type ImageGenerationRequest = {
  prompt: string;
  aspectRatio?: string;
  quality?: "auto" | "low" | "medium" | "high";
};

/**
 * Request for editing an existing image with a text prompt.
 */
export type ImageEditRequest = {
  imageBase64: string;
  imageMimeType: string;
  editPrompt: string;
  aspectRatio?: string;
  quality?: "auto" | "low" | "medium" | "high";
};

/**
 * Response from image generation or editing.
 */
export type ImageGenerationResponse = {
  imageBase64: string;
  mimeType: string;
};

/**
 * Token usage information from image generation.
 */
export type ImageGenerationUsage = {
  inputTokens: number;
  outputTokens: number;
};

/**
 * Result from image generation including response and usage.
 */
export type ImageGenerationResult = {
  images: ImageGenerationResponse[];
  usage?: ImageGenerationUsage;
};

/**
 * Error types specific to image generation.
 */
export type ImageGenerationErrorType =
  | "rate_limit"
  | "content_policy"
  | "invalid_request"
  | "provider_error"
  | "unknown";

/**
 * Error from image generation.
 */
export class ImageGenerationError extends Error {
  readonly errorType: ImageGenerationErrorType;
  readonly isRetryable: boolean;

  constructor(
    message: string,
    errorType: ImageGenerationErrorType,
    isRetryable = false
  ) {
    super(message);
    this.name = "ImageGenerationError";
    this.errorType = errorType;
    this.isRetryable = isRetryable;
  }
}

/**
 * Interface for image model providers.
 * Each provider (Gemini, OpenAI, etc.) implements this interface.
 */
export interface ImageModelProvider {
  /**
   * Provider identifier.
   */
  readonly providerId: string;

  /**
   * Model identifier.
   */
  readonly modelId: string;

  /**
   * Generate an image from a text prompt.
   */
  generateImage(
    request: ImageGenerationRequest
  ): Promise<Result<ImageGenerationResult, ImageGenerationError>>;

  /**
   * Edit an existing image using a text prompt.
   */
  editImage(
    request: ImageEditRequest
  ): Promise<Result<ImageGenerationResult, ImageGenerationError>>;
}
