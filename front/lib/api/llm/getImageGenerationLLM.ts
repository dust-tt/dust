import { ImageGenerationGoogleLLM } from "@app/lib/api/llm/clients/google/imageGeneration";
import { getLlmCredentials } from "@app/lib/api/provider_credentials";
import type { Authenticator } from "@app/lib/auth";
import { GEMINI_3_PRO_IMAGE_MODEL_ID } from "@app/types/assistant/models/google_ai_studio";

export async function getImageGenerationLLM(
  auth: Authenticator
): Promise<ImageGenerationGoogleLLM | null> {
  const credentials = await getLlmCredentials(auth, {
    skipEmbeddingApiKeyRequirement: true,
  });
  const plan = auth.getNonNullablePlan();

  if (!plan.isByok) {
    return new ImageGenerationGoogleLLM(auth, {
      modelId: GEMINI_3_PRO_IMAGE_MODEL_ID,
      credentials,
    });
  }

  return null;
}
