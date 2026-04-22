import { ImageGenerationGoogleLLM } from "@app/lib/api/llm/clients/google/imageGeneration";
import { ImageGenerationOpenAILLM } from "@app/lib/api/llm/clients/openai/imageGeneration";
import type { ImageGenerationLLM } from "@app/lib/api/llm/imageGeneration";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import { isProviderWhitelisted } from "@app/lib/assistant";
import { getFeatureFlags, type Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";
import { GPT_IMAGE_2_MODEL_ID } from "@app/types/assistant/models/openai";

export async function getImageGenerationLLM(
  auth: Authenticator
): Promise<ImageGenerationLLM | null> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const featureFlags = await getFeatureFlags(auth);
  if (featureFlags.includes("gpt_image_2_feature")) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials,
    });
  }

  const plan = auth.getNonNullablePlan();

  if (!plan.isByok || isProviderWhitelisted(auth, "google_ai_studio")) {
    return new ImageGenerationGoogleLLM(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials,
    });
  }

  if (isProviderWhitelisted(auth, "openai")) {
    return new ImageGenerationOpenAILLM(auth, {
      modelId: GPT_IMAGE_2_MODEL_ID,
      credentials,
    });
  }

  return null;
}
