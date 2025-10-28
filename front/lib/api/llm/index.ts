import { GoogleLLM } from "@app/lib/api/llm/clients/google";
import { GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS } from "@app/lib/api/llm/clients/google/types";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import { MISTRAL_WHITELISTED_MODEL_IDS } from "@app/lib/api/llm/clients/mistral/types";
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

export async function getLLM(
  auth: Authenticator,
  { modelId, temperature, reasoningEffort, bypassFeatureFlag }: LLMParameters
): Promise<LLM | null> {
  const modelConfiguration = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );
  if (!modelConfiguration) {
    return null;
  }

  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  const hasFeature =
    bypassFeatureFlag ?? featureFlags.includes("llm_router_direct_requests");

  if (!hasFeature) {
    return null;
  }

  if (MISTRAL_WHITELISTED_MODEL_IDS.includes(modelId)) {
    return new MistralLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (GOOGLE_AI_STUDIO_WHITELISTED_MODEL_IDS.includes(modelId)) {
    return new GoogleLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  return null;
}
