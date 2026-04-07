import type {
  Base64ImageData,
  ImageGenerationError,
} from "@app/lib/api/actions/servers/image_generation/helpers";
import type { ImageGenerationToolInput } from "@app/lib/api/actions/servers/image_generation/metadata";
import type { Authenticator } from "@app/lib/auth";
import type { FileResource } from "@app/lib/resources/file_resource";
import type { ImageModelIdType } from "@app/types/assistant/models/models";
import type { ModelProviderIdType } from "@app/types/assistant/models/types";
import type { LLMCredentialsType } from "@app/types/provider_credential";
import type { Result } from "@app/types/shared/result";

export type TokenCountDetails = {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
};

export type ImageGenerationInput = Omit<
  ImageGenerationToolInput,
  "referenceImages" | "outputName"
> & {
  fileResources?: FileResource[];
};

export type ImageGenerationOutput = {
  images: Base64ImageData[];
  usageMetadata: TokenCountDetails;
};

export abstract class ImageGenerationLLM {
  abstract readonly supportedContentTypes: string[];
  protected readonly auth: Authenticator;
  readonly modelId: ImageModelIdType;
  abstract readonly providerId: ModelProviderIdType;

  protected readonly TEMPERATURE = 0.7;

  constructor(
    auth: Authenticator,
    {
      modelId,
      credentials: _credentials,
    }: {
      modelId: ImageModelIdType;
      credentials: LLMCredentialsType;
    }
  ) {
    this.auth = auth;
    this.modelId = modelId;
  }

  abstract generateImage(
    params: ImageGenerationInput
  ): Promise<Result<ImageGenerationOutput, ImageGenerationError>>;

  abstract getModelParameters(
    params: ImageGenerationInput
  ): Record<string, string | number>;
}
