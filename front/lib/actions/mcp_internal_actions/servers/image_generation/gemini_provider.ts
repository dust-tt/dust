import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type {
  ImageEditRequest,
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageModelProvider,
} from "@app/lib/actions/mcp_internal_actions/servers/image_generation/types";
import { ImageGenerationError } from "@app/lib/actions/mcp_internal_actions/servers/image_generation/types";
import logger from "@app/logger/logger";
import type { Result } from "@app/types";
import { dustManagedCredentials, Err, Ok } from "@app/types";

const DEFAULT_IMAGE_OUTPUT_FORMAT = "png";
const DEFAULT_IMAGE_MIME_TYPE = "image/png";

// Schema for validating Gemini inline data parts
const GeminiInlineDataPartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string().optional(),
  }),
});

type GeminiInlineDataPart = z.infer<typeof GeminiInlineDataPartSchema>;

/**
 * Type guard to validate Gemini inline data parts.
 */
function isValidGeminiInlineDataPart(
  part: unknown
): part is GeminiInlineDataPart {
  return GeminiInlineDataPartSchema.safeParse(part).success;
}

/**
 * Validate Gemini API response and extract image parts.
 */
function validateGeminiImageResponse(
  response: unknown,
  operationType: "generation" | "editing",
  promptText: string
): Result<GeminiInlineDataPart[], ImageGenerationError> {
  const typedResponse = response as {
    candidates?: Array<{
      content?: {
        parts?: unknown[];
      };
    }>;
    promptFeedback?: {
      blockReason?: string;
      safetyRatings?: unknown[];
    };
  };

  // Check for empty candidates
  if (!typedResponse.candidates || typedResponse.candidates.length === 0) {
    if (typedResponse.promptFeedback?.blockReason) {
      logger.error(
        {
          blockReason: typedResponse.promptFeedback.blockReason,
          safetyRatings: typedResponse.promptFeedback.safetyRatings,
          prompt: promptText,
        },
        `Gemini image ${operationType}: Prompt blocked by safety filters`
      );
      return new Err(
        new ImageGenerationError(
          `Image ${operationType} blocked by safety filters: ${typedResponse.promptFeedback.blockReason}`,
          "content_policy"
        )
      );
    }
    return new Err(
      new ImageGenerationError("No image generated.", "provider_error")
    );
  }

  // Validate content structure
  const content = typedResponse.candidates[0].content;
  if (!content || !content.parts) {
    return new Err(
      new ImageGenerationError("No image data in response", "provider_error")
    );
  }

  // Extract valid image parts
  const imageParts = content.parts.filter(isValidGeminiInlineDataPart);
  if (imageParts.length === 0) {
    return new Err(
      new ImageGenerationError("No image data in response.", "provider_error")
    );
  }

  return new Ok(imageParts);
}

/**
 * Extract token usage from Gemini response.
 */
function extractUsageFromResponse(response: unknown): {
  inputTokens: number;
  outputTokens: number;
} {
  const typedResponse = response as {
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  return {
    inputTokens: typedResponse.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: typedResponse.usageMetadata?.candidatesTokenCount ?? 0,
  };
}

/**
 * Format image parts into ImageGenerationResult.
 */
function formatImageResult(
  imageParts: GeminiInlineDataPart[],
  usage: { inputTokens: number; outputTokens: number }
): ImageGenerationResult {
  return {
    images: imageParts.map((part) => ({
      imageBase64: part.inlineData.data,
      mimeType: part.inlineData.mimeType ?? DEFAULT_IMAGE_MIME_TYPE,
    })),
    usage,
  };
}

/**
 * Gemini image model provider implementation.
 */
export class GeminiImageProvider implements ImageModelProvider {
  readonly providerId = "google_ai_studio";
  readonly modelId: string;
  private client: GoogleGenAI;

  constructor(modelId: string) {
    this.modelId = modelId;
    const credentials = dustManagedCredentials();
    this.client = new GoogleGenAI({
      apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  async generateImage(
    request: ImageGenerationRequest
  ): Promise<Result<ImageGenerationResult, ImageGenerationError>> {
    const { prompt, aspectRatio, quality } = request;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: prompt,
        config: {
          temperature: 0.7,
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: aspectRatio ? { aspectRatio } : undefined,
        },
      });

      const validationResult = validateGeminiImageResponse(
        response,
        "generation",
        prompt
      );
      if (validationResult.isErr()) {
        return validationResult;
      }

      const usage = extractUsageFromResponse(response);
      return new Ok(formatImageResult(validationResult.value, usage));
    } catch (error) {
      logger.error({ error }, "Error generating image with Gemini.");
      return new Err(
        new ImageGenerationError(
          "Error generating image.",
          "provider_error",
          true
        )
      );
    }
  }

  async editImage(
    request: ImageEditRequest
  ): Promise<Result<ImageGenerationResult, ImageGenerationError>> {
    const { imageBase64, imageMimeType, editPrompt, aspectRatio } = request;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelId,
        contents: [
          {
            parts: [
              {
                inlineData: {
                  data: imageBase64,
                  mimeType: imageMimeType,
                },
              },
              {
                text: editPrompt,
              },
            ],
          },
        ],
        config: {
          temperature: 0.7,
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: aspectRatio ? { aspectRatio } : undefined,
        },
      });

      const validationResult = validateGeminiImageResponse(
        response,
        "editing",
        editPrompt
      );
      if (validationResult.isErr()) {
        return validationResult;
      }

      const usage = extractUsageFromResponse(response);
      return new Ok(formatImageResult(validationResult.value, usage));
    } catch (error) {
      logger.error({ error }, "Error editing image with Gemini.");
      return new Err(
        new ImageGenerationError(
          "Error editing image.",
          "provider_error",
          true
        )
      );
    }
  }
}
