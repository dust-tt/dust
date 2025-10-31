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
import type { LLM } from "@app/lib/api/llm/llm";
import type { LLMTraceContext } from "@app/lib/api/llm/traces/types";
import type { LLMParameters } from "@app/lib/api/llm/types/options";
import type { Authenticator } from "@app/lib/auth";
import { getFeatureFlags } from "@app/lib/auth";
import { SUPPORTED_MODEL_CONFIGS } from "@app/types";

async function hasFeatureFlag(auth: Authenticator): Promise<boolean> {
  const featureFlags = await getFeatureFlags(auth.getNonNullableWorkspace());
  return featureFlags.includes("llm_router_direct_requests");
}

export async function getLLM(
  auth: Authenticator,
  { modelId, temperature, reasoningEffort, bypassFeatureFlag }: LLMParameters,
  context?: LLMTraceContext
): Promise<LLM | null> {
  const modelConfiguration = SUPPORTED_MODEL_CONFIGS.find(
    (config) => config.modelId === modelId
  );
  if (!modelConfiguration) {
    return null;
  }

  const hasFeature = bypassFeatureFlag ?? (await hasFeatureFlag(auth));
  if (!hasFeature) {
    return null;
  }

  if (isMistralWhitelistedModelId(modelId)) {
    return new MistralLLM(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
    });
  }

  if (isGoogleAIStudioWhitelistedModelId(modelId)) {
    return new GoogleLLM(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
    });
  }

  if (isOpenAIResponsesWhitelistedModelId(modelId)) {
    return new OpenAIResponsesLLM(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
    });
  }

  if (isAnthropicWhitelistedModelId(modelId)) {
    return new AnthropicLLM(auth, {
      modelId,
      temperature,
      reasoningEffort,
      bypassFeatureFlag,
      context,
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

  return null;
}
