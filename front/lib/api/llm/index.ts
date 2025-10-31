import { AnthropicLLM } from "@app/lib/api/llm/clients/anthropic";
import { isAnthropicWhitelistedModelId } from "@app/lib/api/llm/clients/anthropic/types";
import { FireworksLLM } from "@app/lib/api/llm/clients/fireworks";
import { isFireworksWhitelistedModelId } from "@app/lib/api/llm/clients/fireworks/types";
import { GoogleLLM } from "@app/lib/api/llm/clients/google";
import { isGoogleAIStudioWhitelistedModelId } from "@app/lib/api/llm/clients/google/types";
import { MistralLLM } from "@app/lib/api/llm/clients/mistral";
import { isMistralWhitelistedModelId } from "@app/lib/api/llm/clients/mistral/types";
import { OpenAIResponsesLLM } from "@app/lib/api/llm/clients/openai";
import { isOpenAIResponsesWhitelistedModelId } from "@app/lib/api/llm/clients/openai/types";
import { TogetherAILLM } from "@app/lib/api/llm/clients/togetherai";
import { isTogetherAIWhitelistedModelId } from "@app/lib/api/llm/clients/togetherai/types";
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

  if (isOpenAIResponsesWhitelistedModelId(modelId)) {
    return new OpenAIResponsesLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (isAnthropicWhitelistedModelId(modelId)) {
    return new AnthropicLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (isFireworksWhitelistedModelId(modelId)) {
    return new FireworksLLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
    });
  }

  if (isTogetherAIWhitelistedModelId(modelId)) {
    const { TOGETHERAI_API_KEY } = dustManagedCredentials();
    if (!TOGETHERAI_API_KEY) {
      throw new Error("TOGETHERAI_API_KEY environment variable is required");
    }

    return new TogetherAILLM({
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      apiKey: TOGETHERAI_API_KEY,
    });
  }

  return null;
}
