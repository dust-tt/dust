import type { GenerateImageInputType } from "@app/lib/actions/mcp_internal_actions/types";
import {
  type Base64ImageData,
  ImageGenerationError,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import {
  type ImageGenerationInput,
  ImageGenerationLLM,
  type ImageGenerationOutput,
} from "@app/lib/api/llm/imageGeneration";
import type { Authenticator } from "@app/lib/auth";
import { trustedFetch } from "@app/lib/egress/server";
import type { FileResource } from "@app/lib/resources/file_resource";
import { concurrentExecutor } from "@app/temporal/utils";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Err, Ok, type Result } from "@app/types/shared/result";
import { isString } from "@app/types/shared/utils/general";
import assert from "assert";
import { OpenAI, toFile } from "openai";
import type {
  ImageGenerateParamsBase,
  ImagesResponse,
} from "openai/resources/images";
import { OPENAI_PROVIDER_ID } from "./types";

type SupportedImageSize = Extract<
  ImageGenerateParamsBase["size"],
  "1024x1024" | "1536x1024" | "1024x1536"
>;

const ASPECT_RATIO_TO_SIZE: Record<
  GenerateImageInputType["aspectRatio"],
  SupportedImageSize
> = {
  "1:1": "1024x1024",
  "3:2": "1536x1024",
  "4:3": "1536x1024",
  "5:4": "1536x1024",
  "16:9": "1536x1024",
  "21:9": "1536x1024",
  "2:3": "1024x1536",
  "3:4": "1024x1536",
  "4:5": "1024x1536",
  "9:16": "1024x1536",
};

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
      credentials: { OPENAI_API_KEY?: string };
    }
  ) {
    super(auth, { modelId, credentials });
    this.providerId = OPENAI_PROVIDER_ID;
    this.supportedContentTypes = ["image/jpeg", "image/png", "image/webp"];

    assert(credentials.OPENAI_API_KEY, "OPENAI_API_KEY credential is required");
    this.client = new OpenAI({ apiKey: credentials.OPENAI_API_KEY });
  }

  async generateImage(
    params: ImageGenerationInput
  ): Promise<Result<ImageGenerationOutput, ImageGenerationError>> {
    const { prompt, aspectRatio, fileResources, quality } = params;

    const size = ASPECT_RATIO_TO_SIZE[aspectRatio];

    let response: ImagesResponse;
    try {
      if (fileResources && fileResources.length > 0) {
        const uploadables = await this.toUploadableFiles(fileResources);

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

    return new Ok({
      images: validationResult.value,
      usageMetadata: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
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

  getModelParameters(
    params: ImageGenerationInput
  ): Record<string, string | number> {
    return {
      size: ASPECT_RATIO_TO_SIZE[params.aspectRatio],
      quality: params.quality,
    };
  }

  private async toUploadableFiles(fileResources: FileResource[]) {
    return concurrentExecutor(
      fileResources,
      async (fileResource) => {
        const signedUrl = await fileResource.getSignedUrlForDownload(
          this.auth,
          "original"
        );
        const res = await trustedFetch(signedUrl);
        const arrayBuffer = await res.arrayBuffer();
        return toFile(Buffer.from(arrayBuffer), fileResource.fileName, {
          type: fileResource.contentType,
        });
      },
      { concurrency: 8 }
    );
  }
}
