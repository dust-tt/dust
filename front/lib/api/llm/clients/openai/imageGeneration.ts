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
import { concurrentExecutor } from "@app/temporal/utils";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import { Err, Ok, type Result } from "@app/types/shared/result";
import assert from "assert";
import { OpenAI, toFile } from "openai";
import type { ImagesResponse } from "openai/resources/images";
import { OPENAI_PROVIDER_ID } from "./types";

const ASPECT_RATIO_TO_SIZE: Record<
  string,
  "1024x1024" | "1536x1024" | "1024x1536"
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

    const size = ASPECT_RATIO_TO_SIZE[aspectRatio] ?? "1024x1024";

    let response: ImagesResponse;
    try {
      if (fileResources && fileResources.length > 0) {
        const uploadables = await concurrentExecutor(
          fileResources,
          async (fileResource) => {
            const signedUrl = await fileResource.getSignedUrlForDownload(
              this.auth,
              "original"
            );
            const res = await fetch(signedUrl);
            const buffer = Buffer.from(await res.arrayBuffer());
            return toFile(buffer, fileResource.fileName ?? "image.png", {
              type: fileResource.contentType,
            });
          },
          { concurrency: 8 }
        );

        response = await this.client.images.edit({
          model: this.modelId,
          image: uploadables,
          prompt,
          size,
          quality,
          output_format: "png",
        });
      } else {
        response = await this.client.images.generate({
          model: this.modelId,
          prompt,
          size,
          quality,
          output_format: "png",
        });
      }
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

    if (!response.data || response.data.length === 0) {
      return new Err(new ImageGenerationError("No image generated."));
    }

    const images: Base64ImageData[] = response.data
      .filter((img) => img.b64_json)
      .map((img) => ({
        base64: img.b64_json as string,
        mimeType: "image/png",
      }));

    if (images.length === 0) {
      return new Err(new ImageGenerationError("No image data in response."));
    }

    return new Ok({
      images,
      usageMetadata: {
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
    });
  }
}
