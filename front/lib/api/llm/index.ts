import { GoogleLLM } from "@app/lib/api/llm/clients/google";
import { isGoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import { isMistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import { OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS } from "@app/lib/api/llm/clients/openai/types";
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

  if (isMistralWhitelistedModelId(modelId)) {
    return new MistralLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (isGoogleAIStudioWhitelistedModelId(modelId)) {
    return new GoogleLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (OPEN_AI_RESPONSES_WHITELISTED_MODEL_IDS.includes(modelId)) {
    return new OpenAIResponsesLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  return null;
}
