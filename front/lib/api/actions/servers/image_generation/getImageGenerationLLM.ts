import { ImageGenerationGoogleLLM } from "@app/lib/api/actions/servers/image_generation/clients/google";
import { ImageGenerationOpenAILLM } from "@app/lib/api/actions/servers/image_generation/clients/openai";
import type { ImageGenerationLLM } from "@app/lib/api/actions/servers/image_generation/imageGeneration";
import {
  getEffectiveWhiteListedProviders,
  isProviderWhitelistedForAuth,
} from "@app/lib/api/assistant/models";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { config as regionConfig } from "@app/lib/api/regions/config";
import type { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import {
  GPT_IMAGE_1_5_MODEL_ID,
  GPT_IMAGE_2_MODEL_ID,
} from "@app/types/assistant/models/openai";

export async function getImageGenerationLLM(
  auth: Authenticator
): Promise<ImageGenerationLLM | null> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const whiteListedProviders = await getEffectiveWhiteListedProviders(auth);

  // gpt-image-2 is not eligible to EU data residency yet, so EU workspaces fall
  // back to Gemini for image generation if workspace-enabled, or image 1.5.
  const isEuRegion = regionConfig.getCurrentRegion() === "europe-west1";

  if (
    !isEuRegion &&
    isProviderWhitelistedForAuth(auth, "openai", whiteListedProviders)
  ) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials,
    });
  }

  if (
    isProviderWhitelistedForAuth(auth, "google_ai_studio", whiteListedProviders)
  ) {
    return new ImageGenerationGoogleLLM(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials,
    });
  }

  if (isProviderWhitelistedForAuth(auth, "openai", whiteListedProviders)) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_1_5_MODEL_ID,
      credentials,
    });
  }

  return null;
}
