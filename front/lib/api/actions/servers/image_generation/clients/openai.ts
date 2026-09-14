import type { Base64ImageData } from "@app/lib/api/actions/servers/image_generation/helpers";
import { ImageGenerationError } from "@app/lib/api/actions/servers/image_generation/helpers";
import type {
  ImageGenerationInput,
  ImageGenerationOutput,
  ReferenceImageFile,
  TokenCountDetails,
} from "@app/lib/api/actions/servers/image_generation/imageGeneration";
import { ImageGenerationLLM } from "@app/lib/api/actions/servers/image_generation/imageGeneration";
import { CONVERSATION_IMG_MAX_SIZE_PIXELS } from "@app/lib/api/files/processing/images";
import type { Authenticator } from "@app/lib/auth";
import { trustedFetch } from "@app/lib/egress/server";
import { concurrentExecutor } from "@app/temporal/workflow_utils";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import {
  GPT_IMAGE_2_5_FLARE_MODEL_ID,
  GPT_IMAGE_2_MODEL_ID,
} from "@app/types/assistant/models/openai";
import { OPENAI_PROVIDER_ID } from "@app/types/assistant/models/providers";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { Result } from "@app/types/shared/result";
import { Err, Ok } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import assert from "assert";
import { OpenAI, toFile } from "openai";
import type { ImagesResponse } from "openai/resources/images";

// GPT image models accept arbitrary `WIDTHxHEIGHT` sizes, not only the three documented presets.
// See https://developers.openai.com/api/docs/guides/image-generation.
const SIZE_MULTIPLE = 16;

const MAX_EDGE = CONVERSATION_IMG_MAX_SIZE_PIXELS;

const QUALITY_TO_PIXEL_BUDGET: Record<ImageGenerationInput["quality"], number> =
  {
    low: 1024 * 1024,
    medium: 2048 * 2048,
  };

/**
 * @cc [owner:pmilliotte,label:product] openai-image-size-limits
 * The returned size MUST have the exact requested aspect ratio, both edges multiples of 16, and a
 * total pixel count within [655360, 8294400] — the limits gpt-image models enforce on arbitrary
 * sizes. Sizes outside those limits are rejected by the API.
 */
export function toImageSize({
  aspectRatio,
  quality,
}: Pick<ImageGenerationInput, "aspectRatio" | "quality">): string {
  const [width, height] = aspectRatio.split(":").map(Number);

  // Scale the ratio by the largest factor `k` that keeps both edges multiples of 16 and within the
  // quality's pixel budget and the model's max edge, so the ratio is honored exactly.
  const k = Math.min(
    Math.floor(
      Math.sqrt(
        QUALITY_TO_PIXEL_BUDGET[quality] / (SIZE_MULTIPLE ** 2 * width * height)
      )
    ),
    Math.floor(MAX_EDGE / (SIZE_MULTIPLE * Math.max(width, height)))
  );

  return `${SIZE_MULTIPLE * width * k}x${SIZE_MULTIPLE * height * k}`;
}

function isSafetyBlockError(
  error: unknown
): error is InstanceType<typeof OpenAI.BadRequestError> {
  return (
    error instanceof OpenAI.BadRequestError &&
    (error.code === "content_policy_violation" ||
      error.code === "contentFilter")
  );
}

export class ImageGenerationOpenAILLM extends ImageGenerationLLM {
  readonly supportedContentTypes: string[];
  readonly providerId: ModelProviderIdType;

  private readonly client: OpenAI;

  constructor(
    auth: Authenticator,
    {
      modelId,
      credentials,
    }: {
      modelId: ImageModelIdType;
      credentials: { OPENAI_API_KEY?: string; OPENAI_BASE_URL?: string };
    }
  ) {
    super(auth, { modelId, credentials });
    this.providerId = OPENAI_PROVIDER_ID;
    this.supportedContentTypes = ["image/jpeg", "image/png", "image/webp"];

    assert(credentials.OPENAI_API_KEY, "OPENAI_API_KEY credential is required");
    this.client = new OpenAI({
      apiKey: credentials.OPENAI_API_KEY,
      baseURL: credentials.OPENAI_BASE_URL,
    });
  }

  async generateImage(
    params: ImageGenerationInput
  ): Promise<Result<ImageGenerationOutput, ImageGenerationError>> {
    const { prompt, aspectRatio, referenceFiles, quality } = params;

    const size = toImageSize({ aspectRatio, quality });

    let response: ImagesResponse;
    try {
      if (referenceFiles && referenceFiles.length > 0) {
        const uploadables = await this.toUploadableFiles(referenceFiles);

        response = await this.client.images.edit({
          model: this.modelId,
          image: uploadables,
          prompt,
          size,
          quality,
          output_format: "png",
          n: 1,
        });
      } else {
        response = await this.client.images.generate({
          model: this.modelId,
          prompt,
          size,
          quality,
          output_format: "png",
          n: 1,
        });
      }
    } catch (error) {
      if (isSafetyBlockError(error)) {
        return new Err(
          new ImageGenerationError("safety_blocked", error.message, {
            cause: error,
          })
        );
      }

      return new Err(
        new ImageGenerationError("api_error", "Failed to generate image", {
          cause: error,
        })
      );
    }

    const validationResult = this.validateImageResponse(response);
    if (validationResult.isErr()) {
      return validationResult;
    }

    const usageMetadataResult = this.getUsageMetadata(response);
    if (usageMetadataResult.isErr()) {
      return usageMetadataResult;
    }

    return new Ok({
      images: validationResult.value,
      usageMetadata: usageMetadataResult.value,
    });
  }

  private validateImageResponse(
    response: ImagesResponse
  ): Result<Base64ImageData[], ImageGenerationError> {
    if (!response.data || response.data.length === 0) {
      return new Err(
        new ImageGenerationError("empty_response", "No image generated.")
      );
    }

    const images: Base64ImageData[] = response.data.flatMap((img) =>
      isString(img.b64_json)
        ? [{ base64: img.b64_json, mimeType: "image/png" }]
        : []
    );

    if (images.length === 0) {
      return new Err(
        new ImageGenerationError("empty_response", "No image data in response.")
      );
    }

    return new Ok(images);
  }

  private getUsageMetadata(
    response: ImagesResponse
  ): Result<TokenCountDetails, ImageGenerationError> {
    if (
      (this.modelId === GPT_IMAGE_2_MODEL_ID ||
        this.modelId === GPT_IMAGE_2_5_FLARE_MODEL_ID) &&
      !response.usage
    ) {
      return new Err(
        new ImageGenerationError(
          "api_error",
          "OpenAI image generation response is missing usage metadata."
        )
      );
    }

    return new Ok({
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      totalTokens: response.usage?.total_tokens ?? 0,
    });
  }

  getModelParameters({
    aspectRatio,
    quality,
  }: ImageGenerationInput): Record<string, string | number> {
    return {
      aspectRatio,
      imageSize: toImageSize({ aspectRatio, quality }),
      quality,
    };
  }

  private async toUploadableFiles(referenceFiles: ReferenceImageFile[]) {
    return concurrentExecutor(
      referenceFiles,
      async (referenceFile) => {
        const res = await trustedFetch(referenceFile.signedUrl);
        const arrayBuffer = await res.arrayBuffer();
        return toFile(Buffer.from(arrayBuffer), referenceFile.fileName, {
          type: referenceFile.contentType,
        });
      },
      { concurrency: 8 }
    );
  }
}
