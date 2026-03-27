import {
  type Base64ImageData,
  ImageGenerationError,
  QUALITY_TO_IMAGE_SIZE,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import type { ImageGenerationToolInput } from "@app/lib/api/actions/servers/image_generation/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/temporal/utils";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Err, Ok, type Result } from "@app/types/shared/result";
import {
  createPartFromUri,
  type GenerateContentResponse,
  GoogleGenAI,
  type Part,
} from "@google/genai";
import assert from "assert";
import z from "zod";
import { GOOGLE_AI_STUDIO_PROVIDER_ID } from "./types";

const geminiInlineDataPartSchema = z.object({
  inlineData: z.object({
    data: z.string(),
    mimeType: z.string().optional(),
  }),
});

type GeminiInlineDataPart = z.infer<typeof geminiInlineDataPartSchema>;

type TokenCountDetails = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

type ImageGenerationInput = Omit<
  ImageGenerationToolInput,
  "referenceImages" | "outputName"
> & {
  fileResources?: FileResource[];
};

type ImageGenerationOutput = {
  images: Base64ImageData[];
  usageMetadata: TokenCountDetails;
};

export class ImageGenerationGoogleLLM {
  get supportedContentTypes(): string[] {
    return ["image/bmp", "image/jpeg", "image/png", "image/webp"];
  }
  protected readonly auth: Authenticator;
  protected readonly modelId: ImageModelIdType;
  readonly providerId: ModelProviderIdType;

  private readonly client: GoogleGenAI;

  constructor(
    auth: Authenticator,
    {
      modelId,
      credentials,
    }: {
      modelId: ImageModelIdType;
      credentials: { GOOGLE_AI_STUDIO_API_KEY?: string };
    }
  ) {
    this.auth = auth;
    this.modelId = modelId;
    this.providerId = GOOGLE_AI_STUDIO_PROVIDER_ID;
    assert(
      credentials.GOOGLE_AI_STUDIO_API_KEY,
      "GOOGLE_AI_STUDIO_API_KEY credential is required"
    );
    this.client = new GoogleGenAI({
      apiKey: credentials.GOOGLE_AI_STUDIO_API_KEY,
    });
  }

  async generateImage(
    params: ImageGenerationInput
  ): Promise<Result<ImageGenerationOutput, ImageGenerationError>> {
    const { prompt, aspectRatio, fileResources, quality } = params;

    let imageParts: Part[] = [];

    if (fileResources && fileResources.length > 0) {
      imageParts = await concurrentExecutor(
        fileResources,
        async (fileResource) => {
          const signedUrl = await fileResource.getSignedUrlForDownload(
            this.auth,
            "original"
          );
          return createPartFromUri(signedUrl, fileResource.contentType);
        },
        { concurrency: 8 }
      );
    }

    const imageSize = QUALITY_TO_IMAGE_SIZE[quality];

    const contents =
      imageParts.length > 0
        ? [{ parts: [...imageParts, { text: prompt }] }]
        : prompt;

    let response: GenerateContentResponse;
    try {
      response = await this.client.models.generateContent({
        model: this.modelId,
        contents,
        config: {
          temperature: 0.7,
          responseModalities: ["IMAGE"],
          candidateCount: 1,
          imageConfig: {
            aspectRatio,
            imageSize,
          },
        },
      });
    } catch (error) {
      return new Err(
        new ImageGenerationError(
          "Failed to generate image",
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : undefined
        )
      );
    }

    const validationResult = this.validateImageResponse(
      response,
      "generation",
      prompt
    );

    if (validationResult.isErr()) {
      return validationResult;
    }

    const responseImageParts = validationResult.value;

    return new Ok({
      images: this.partsToBase64Images(responseImageParts),
      usageMetadata: {
        inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
        outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        totalTokens: response.usageMetadata?.totalTokenCount ?? 0,
      },
    });
  }

  private validateImageResponse(
    response: {
      candidates?: Array<{
        content?: {
          parts?: unknown[];
        };
      }>;
      promptFeedback?: {
        blockReason?: string;
        safetyRatings?: unknown;
      };
    },
    operationType: "generation" | "editing",
    promptText: string
  ): Ok<GeminiInlineDataPart[]> | Err<ImageGenerationError> {
    if (!response.candidates || response.candidates.length === 0) {
      if (response.promptFeedback?.blockReason) {
        return new Err(
          new ImageGenerationError(
            `Image ${operationType} blocked by safety filters: ${response.promptFeedback.blockReason}`,
            {
              blockReason: response.promptFeedback.blockReason,
              safetyRatings: response.promptFeedback.safetyRatings,
              prompt: promptText,
            }
          )
        );
      }
      return new Err(new ImageGenerationError("No image generated."));
    }

    const content = response.candidates[0].content;
    if (!content || !content.parts) {
      return new Err(new ImageGenerationError("No image data in response"));
    }

    const imageParts = content.parts.filter(this.isValidInlineDataPart);
    if (imageParts.length === 0) {
      return new Err(new ImageGenerationError("No image data in response."));
    }

    return new Ok(imageParts);
  }

  private partsToBase64Images(
    parts: GeminiInlineDataPart[]
  ): Base64ImageData[] {
    return parts.map((part) => ({
      base64: part.inlineData.data,
      mimeType: part.inlineData.mimeType,
    }));
  }

  private isValidInlineDataPart(part: unknown): part is GeminiInlineDataPart {
    return geminiInlineDataPartSchema.safeParse(part).success;
  }
}
