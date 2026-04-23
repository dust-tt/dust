import { ImageGenerationGoogleLLM } from "@app/lib/api/llm/clients/google/imageGeneration";
import { ImageGenerationOpenAILLM } from "@app/lib/api/llm/clients/openai/imageGeneration";
import type { ImageGenerationLLM } from "@app/lib/api/llm/imageGeneration";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { config as regionConfig } from "@app/lib/api/regions/config";
import { isProviderWhitelisted } from "@app/lib/assistant";
import type { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_MODEL_ID } from "@app/types/assistant/models/openai";

export async function getImageGenerationLLM(
  auth: Authenticator
): Promise<ImageGenerationLLM | null> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  // gpt-image-2 is not available from the EU region, so EU workspaces fall
  // back to Gemini for image generation.
  const isEuRegion = regionConfig.getCurrentRegion() === "europe-west1";

  if (!isEuRegion && isProviderWhitelisted(auth, "openai")) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials,
    });
  }

  if (isProviderWhitelisted(auth, "google_ai_studio")) {
    return new ImageGenerationGoogleLLM(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials,
    });
  }

  return null;
}
