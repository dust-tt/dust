import { ImageGenerationGoogleLLM } from "@app/lib/api/actions/servers/image_generation/clients/google";
import { ImageGenerationOpenAILLM } from "@app/lib/api/actions/servers/image_generation/clients/openai";
import type { ImageGenerationLLM } from "@app/lib/api/actions/servers/image_generation/imageGeneration";
import { isProviderWhitelistedForAuth } from "@app/lib/api/assistant/models";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_5_FLARE_MODEL_ID } from "@app/types/assistant/models/openai";

export async function getImageGenerationLLM(
  auth: Authenticator
): Promise<ImageGenerationLLM | null> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });

  if (isProviderWhitelistedForAuth(auth, "openai")) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_2_5_FLARE_MODEL_ID,
      credentials,
    });
  }

  if (isProviderWhitelistedForAuth(auth, "google_ai_studio")) {
    return new ImageGenerationGoogleLLM(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials,
    });
  }

  return null;
}
